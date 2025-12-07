import {
  Appeal,
  Incidence,
  Notification,
  Product,
  ProductPhoto,
  User,
} from "../models/index.js";
import { emitNotificationToUsers } from "../utils/websocket-emitter.js";

export const getAllIncidences = async (req, res) => {
  try {
    const incidences = await Incidence.findAll({
      include: [
        {
          model: Product,
          include: [{ model: ProductPhoto }],
        },
        {
          model: User,
          attributes: ["id", "name", "lastname", "email"],
        },
        {
          model: Appeal,
          attributes: ["id", "dateAppeals", "description", "incidenceId"],
        },
      ],
    });
    res.json(incidences);
  } catch (error) {
    console.error("Error en getAllIncidences:", error);
    res
      .status(500)
      .json({ message: "Error al obtener incidencias", error: error.message });
  }
};

export const getIncidenceById = async (req, res) => {
  try {
    const incidence = await Incidence.findByPk(req.params.id, {
      include: [
        {
          model: Product,
          include: [{ model: ProductPhoto }],
        },
        {
          model: User,
          attributes: ["id", "name", "lastname", "email"],
        },
        {
          model: Appeal,
          attributes: ["id", "dateAppeals", "description", "incidenceId"],
        },
      ],
    });
    if (!incidence)
      return res.status(404).json({ message: "Incidencia no encontrada" });
    res.json(incidence);
  } catch (error) {
    console.error("Error en getIncidenceById:", error);
    res.status(500).json({
      message: "Error al obtener la incidencia",
      error: error.message,
    });
  }
};

export const getIncidencesByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const incidences = await Incidence.findAll({ where: { userId } });
    res.json(incidences);
  } catch (error) {
    console.error("Error en getIncidencesByUser:", error);
    res.status(500).json({
      message: "Error al obtener incidencias del usuario",
      error: error.message,
    });
  }
};

export const createIncidence = async (req, res) => {
  try {
    const {
      description,
      userId,
      productId,
      status,
      assignedByAdminId,
      reportCount,
      reportId,
      appealId,
      isAppealReview,
    } = req.body;

    console.log("=== CREANDO INCIDENCIA ===");
    console.log("Datos recibidos:", {
      description,
      userId,
      productId,
      status,
      assignedByAdminId,
      reportCount,
      reportId,
      appealId,
      isAppealReview,
    });

    if (!description || !userId || !productId) {
      console.error("Faltan campos requeridos");
      return res
        .status(400)
        .json({ message: "description, userId y productId son requeridos" });
    }

    // Obtener información del producto y vendedor ANTES de crear la incidencia
    const product = await Product.findByPk(productId);
    const productTitle = product?.title || `Producto #${productId}`;
    const sellerId = product?.sellerId;

    // Si hay 5 o más reportes, suspender automáticamente
    const shouldAutoSuspend = reportCount >= 5;

    const incidence = await Incidence.create({
      dateIncidence: new Date(),
      description: shouldAutoSuspend
        ? `${description} [AUTO-SUSPENDIDO: ${reportCount} reportes]`
        : description,
      userId, // moderador/administrador asignado
      productId,
      reportId: reportId || null,
      appealId: appealId || null,
      isAppealReview: isAppealReview || false,
      status: shouldAutoSuspend ? "resolved" : status || "pending",
      resolution: shouldAutoSuspend ? "suspended" : null,
      resolutionNotes: shouldAutoSuspend
        ? `Producto suspendido automáticamente por recibir ${reportCount} reportes. Revisión necesaria antes de reactivar.`
        : null,
      resolvedAt: shouldAutoSuspend ? new Date() : null,
    });

    console.log("✅ Incidencia creada:", incidence.toJSON());

    // Si se creó desde un reporte, actualizar el reporte
    if (reportId) {
      await Report.update(
        { status: "converted_to_incidence", incidenceId: incidence.id },
        { where: { id: reportId } }
      );
      console.log(
        `✅ Reporte ${reportId} marcado como convertido a incidencia`
      );
    }

    // Si se creó desde una apelación, actualizar la apelación
    if (appealId) {
      await Appeal.update(
        { status: "converted_to_incidence", newIncidenceId: incidence.id },
        { where: { id: appealId } }
      );
      console.log(
        `✅ Apelación ${appealId} marcada como convertida a incidencia`
      );
    }

    // Actualizar estado del producto
    if (shouldAutoSuspend) {
      await product.update({
        moderationStatus: "suspended",
        status: "inactive",
      });
      console.log(
        `🔒 Producto ${productId} SUSPENDIDO automáticamente por ${reportCount} reportes`
      );
    } else {
      await product.update({ moderationStatus: "review" });
    }

    // 1. Notificar al VENDEDOR
    if (sellerId) {
      try {
        const sellerMessage = shouldAutoSuspend
          ? `Tu producto "${productTitle}" ha sido suspendido automáticamente por recibir ${reportCount} reportes de usuarios. Contacta con soporte para más información. Incidencia #${incidence.id}`
          : `Tu producto "${productTitle}" está siendo revisado por reportes de usuarios. Puedes apelar desde "Mis Productos". Incidencia #${incidence.id}`;

        const sellerNotification = await Notification.create({
          userId: sellerId,
          typeId: 2, // Alerta
          title: shouldAutoSuspend
            ? "Producto suspendido"
            : "Producto en revisión",
          message: sellerMessage,
          read: false,
          productId: productId,
        });

        emitNotificationToUsers(sellerId, sellerNotification.toJSON());
        console.log(`📬 Notificación enviada al vendedor ${sellerId}`);
      } catch (notifError) {
        console.error("Error al enviar notificación al vendedor:", notifError);
      }
    }

    // 2. Si fue asignado por un admin (y NO es auto-suspendido), notificar al moderador
    if (
      assignedByAdminId &&
      assignedByAdminId !== userId &&
      !shouldAutoSuspend
    ) {
      try {
        const notification = await Notification.create({
          userId: userId, // Moderador asignado
          typeId: 2, // Alerta
          title: "Nueva incidencia asignada",
          message: `Se te ha asignado una incidencia para revisar el producto "${productTitle}". Incidencia #${incidence.id}`,
          read: false,
          productId: productId,
        });

        emitNotificationToUsers(userId, notification.toJSON());
        console.log(
          `📬 Notificación enviada al moderador ${userId} por asignación`
        );
      } catch (notifError) {
        console.error(
          "Error al enviar notificación de asignación:",
          notifError
        );
      }
    }

    res.status(201).json({
      message: shouldAutoSuspend
        ? "Incidencia creada y producto auto-suspendido"
        : "Incidencia creada",
      incidence,
      autoSuspended: shouldAutoSuspend,
    });
  } catch (error) {
    console.error("❌ Error en createIncidence:", error);
    res
      .status(500)
      .json({ message: "Error al crear incidencia", error: error.message });
  }
};

export const updateIncidence = async (req, res) => {
  try {
    const incidenceId = req.params.id;
    const {
      description,
      status,
      productId,
      userId,
      resolution,
      resolutionNotes,
    } = req.body;

    const incidence = await Incidence.findByPk(incidenceId, {
      include: [{ model: Product }],
    });
    if (!incidence)
      return res.status(404).json({ message: "Incidencia no encontrada" });

    const previousStatus = incidence.status;

    // Preparar datos de actualización
    const updateData = {
      description:
        description !== undefined ? description : incidence.description,
      status: status !== undefined ? status : incidence.status,
      productId: productId !== undefined ? productId : incidence.productId,
      userId: userId !== undefined ? userId : incidence.userId,
    };

    // Notificar al vendedor cuando cambia de "pending" a "in_progress"
    if (
      previousStatus === "pending" &&
      status === "in_progress" &&
      incidence.Product
    ) {
      try {
        const sellerId = incidence.Product.sellerId;
        const productName = incidence.Product.title;

        const notification = await Notification.create({
          userId: sellerId,
          typeId: 2,
          title: "Producto en revisión",
          message: `Un moderador está revisando tu producto "${productName}". Incidencia #${incidenceId}`,
          read: false,
          productId: incidence.productId,
        });

        emitNotificationToUsers(sellerId, notification.toJSON());
        console.log(
          `📬 Notificación enviada al vendedor ${sellerId} - Incidencia en revisión`
        );
      } catch (notifError) {
        console.error("Error al notificar cambio a en_revision:", notifError);
      }
    }

    // Si se está resolviendo la incidencia
    if (status === "resolved" && resolution) {
      updateData.resolution = resolution;
      updateData.resolutionNotes = resolutionNotes || null;
      updateData.resolvedAt = new Date();

      // Actualizar el producto según la resolución
      const product = await Product.findByPk(incidence.productId);
      if (product) {
        // Verificar si esta incidencia viene de una apelación
        // Buscamos si existe un appealId asociado para saber si es revisión de apelación
        const isAppealReview = incidence.appealId ? true : false;

        switch (resolution) {
          case "approved":
            // Aprobar - producto vuelve a estar activo (acepta apelación o rechaza reporte inicial)
            await product.update({
              moderationStatus: "active",
              status: "active",
            });
            break;
          case "rejected":
            // Rechazar tiene diferentes significados según el contexto
            if (!isAppealReview) {
              // Primera decisión: rechazar el reporte = producto vuelve activo
              await product.update({
                moderationStatus: "active",
                status: "active",
              });
            } else {
              // Apelación: rechazar apelación = bloqueo permanente
              // Usar valores que existen en los ENUMs
              await product.update({
                moderationStatus: "permanently_suspended",
                status: "restricted",
              });
            }
            break;
          case "suspended":
            // Suspender solo se usa en primera decisión
            if (!isAppealReview) {
              await product.update({
                moderationStatus: "suspended",
                status: "inactive", // Oculto pero puede apelar
              });
            } else {
              // Si es apelación y se suspende nuevamente, es bloqueo permanente
              // Usar valores que existen en los ENUMs
              await product.update({
                moderationStatus: "permanently_suspended",
                status: "restricted",
              });
            }
            break;
          case "permanently_suspended":
            // Bloqueo permanente directo
            // Usar valores que existen en los ENUMs
            await product.update({
              moderationStatus: "permanently_suspended",
              status: "restricted",
            });
            break;
        }
      }

      // Crear notificación para el vendedor
      if (incidence.Product) {
        const sellerId = incidence.Product.sellerId;
        const productName = incidence.Product.title;
        const isAppealReview = incidence.isAppealReview || false;

        let notificationTitle = "";
        let notificationMessage = "";

        switch (resolution) {
          case "approved":
            notificationTitle = isAppealReview
              ? "Apelación Aceptada"
              : "Producto Aprobado";
            notificationMessage = isAppealReview
              ? `Tu apelación sobre el producto "${productName}" ha sido aceptada. El producto está nuevamente activo.`
              : `Tu producto "${productName}" ha sido revisado y aprobado. No se encontraron problemas.`;
            break;
          case "rejected":
            notificationTitle = isAppealReview
              ? "Apelación Rechazada"
              : "Reporte Rechazado";
            notificationMessage = isAppealReview
              ? `Tu apelación sobre el producto "${productName}" ha sido rechazada. El producto permanece suspendido.`
              : `El reporte sobre tu producto "${productName}" fue rechazado. Tu producto está activo.`;
            break;
          case "suspended":
            if (!isAppealReview) {
              notificationTitle = "Producto Suspendido Temporalmente";
              notificationMessage = `Tu producto "${productName}" ha sido suspendido temporalmente por violar las políticas. Puedes apelar esta decisión desde "Mis Productos" antes de [FECHA]. Si no apelas, la suspensión se volverá permanente.`;
            } else {
              notificationTitle = "Producto Suspendido Permanentemente";
              notificationMessage = `Tu apelación sobre "${productName}" fue rechazada. El producto ha sido suspendido permanentemente. Esta decisión no se puede apelar.`;
            }
            break;
          case "permanently_suspended":
            notificationTitle = "Producto Eliminado Permanentemente";
            notificationMessage = `Tu producto "${productName}" ha sido eliminado permanentemente por violar gravemente las políticas de la plataforma. Esta decisión no se puede apelar.`;
            break;
        }

        if (resolutionNotes && !notificationMessage.includes("Observaciones")) {
          notificationMessage += ` Observaciones del moderador: ${resolutionNotes}`;
        }

        const notification = await Notification.create({
          userId: sellerId,
          typeId: 2, // Alerta (notificación de moderación)
          title: notificationTitle,
          message: notificationMessage,
          read: false,
          productId: incidence.productId,
        });

        // Emitir notificación en tiempo real vía WebSocket
        emitNotificationToUsers(sellerId, notification.toJSON());
      }
    }

    await incidence.update(updateData);

    res.json({ message: "Incidencia actualizada", incidence });
  } catch (error) {
    console.error("Error en updateIncidence:", error);
    res.status(500).json({
      message: "Error al actualizar incidencia",
      error: error.message,
    });
  }
};

export const deleteIncidence = async (req, res) => {
  try {
    const incidenceId = req.params.id;
    const incidence = await Incidence.findByPk(incidenceId);
    if (!incidence)
      return res.status(404).json({ message: "Incidencia no encontrada" });

    await incidence.destroy();
    res.json({ message: "Incidencia eliminada", incidence });
  } catch (error) {
    console.error("Error en deleteIncidence:", error);
    res
      .status(500)
      .json({ message: "Error al eliminar incidencia", error: error.message });
  }
};
