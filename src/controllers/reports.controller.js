import { Report, User, UserRole, Product, Notification } from "../models/index.js";
import { emitNotificationToUsers } from "../utils/websocket-emitter.js";

export const getAllReports = async (req, res) => {
  try {
    const reports = await Report.findAll();
    res.json({
      success: true,
      payload: reports,
      data: reports // Para compatibilidad
    });
  } catch (error) {
    console.error("Error en getAllReports:", error);
    res.status(500).json({ 
      success: false,
      message: "Error al obtener reportes", 
      error: error.message,
      payload: [],
      data: []
    });
  }
};

export const getReportById = async (req, res) => {
  try {
    const report = await Report.findByPk(req.params.id);
    if (!report) return res.status(404).json({ message: "Reporte no encontrado" });
    res.json(report);
  } catch (error) {
    console.error("Error en getReportById:", error);
    res.status(500).json({ message: "Error al obtener el reporte", error: error.message });
  }
};

export const getReportsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const reports = await Report.findAll({ where: { userId } });
    res.json(reports);
  } catch (error) {
    console.error("Error en getReportsByUser:", error);
    res.status(500).json({ message: "Error al obtener reportes del usuario", error: error.message });
  }
};

export const createReport = async (req, res) => {
  try {
    console.log('📝 === CREANDO REPORTE ===');
    console.log('Body recibido:', req.body);
    
    const { type, description, userId, productId } = req.body;

    if (!type || !description || !userId || !productId) {
      console.log('❌ Faltan campos requeridos');
      return res.status(400).json({ message: "type, description, userId y productId son requeridos" });
    }

    // Crear el reporte
    const report = await Report.create({
      dateReport: new Date(),
      typeReport: type,
      description,
      userId,
      productId,
    });
    
    console.log('✅ Reporte creado:', report.id);

    // Obtener información del producto para la notificación
    const product = await Product.findByPk(productId);
    const productTitle = product?.title || `Producto #${productId}`;
    console.log('Producto encontrado:', productTitle);

    // Obtener todos los moderadores y administradores (roleId 1=Admin, 3=Moderador)
    const moderatorsAndAdmins = await UserRole.findAll({
      where: { roleId: [1, 3] },
      attributes: ['userId']
    });
    console.log('Moderadores encontrados:', moderatorsAndAdmins.length);
    console.log('UserRoles:', JSON.stringify(moderatorsAndAdmins));

    // Crear notificaciones para cada moderador/admin
    const moderatorIds = [...new Set(moderatorsAndAdmins.map(ur => ur.userId))]; // Eliminar duplicados
    console.log('IDs de moderadores unicos:', moderatorIds);
    
    if (moderatorIds.length === 0) {
      console.log('⚠️ No se encontraron moderadores para notificar');
      return res.status(201).json({ message: "Reporte creado (sin moderadores para notificar)", report });
    }
    
    const notificationPromises = moderatorIds.map(modId =>
      Notification.create({
        userId: modId,
        typeId: 2, // Alerta
        title: 'Nuevo reporte de producto',
        message: `Se ha reportado el producto "${productTitle}" por: ${type}. Descripción: ${description.substring(0, 100)}${description.length > 100 ? '...' : ''}`,
        read: false,
        productId: productId, // Agregar productId para poder redirigir
        reportId: report.id    // Agregar reportId para referencia
      })
    );

    const createdNotifications = await Promise.all(notificationPromises);

    // Emitir notificaciones en tiempo real vía WebSocket
    createdNotifications.forEach((notification, index) => {
      emitNotificationToUsers(moderatorIds[index], notification.toJSON());
    });

    console.log(`✅ Reporte creado y ${moderatorIds.length} moderadores notificados (DB + WebSocket)`);

    res.status(201).json({ message: "Reporte creado", report });
  } catch (error) {
    console.error("Error en createReport:", error);
    res.status(500).json({ message: "Error al crear reporte", error: error.message });
  }
};

export const deleteReport = async (req, res) => {
  try {
    const reportId = req.params.id;
    const report = await Report.findByPk(reportId);
    if (!report) return res.status(404).json({ message: "Reporte no encontrado" });

    await report.destroy();
    res.json({ message: "Reporte eliminado", report });
  } catch (error) {
    console.error("Error en deleteReport:", error);
    res.status(500).json({ message: "Error al eliminar reporte", error: error.message });
  }
};