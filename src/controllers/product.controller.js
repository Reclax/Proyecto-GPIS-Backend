import fs from "fs";
import multer from "multer";
import path from "path";
import { Op } from "sequelize";
import {
  Category,
  Incidence,
  Product,
  ProductPhoto,
  Report,
  User,
} from "../models/index.js";

// =======================================================
// Configuración de Multer para fotos de productos
// =======================================================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const tmpPath = path.join("uploads", "products", "tmp");
    if (!fs.existsSync(tmpPath)) {
      fs.mkdirSync(tmpPath, { recursive: true });
    }
    cb(null, tmpPath);
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

function fileFilter(req, file, cb) {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error("Formato no permitido"), false);
}

export const uploadProductPhotos = multer({ storage, fileFilter });

// =======================================================
// Obtener todos los productos
// =======================================================
export const getAllProducts = async (req, res) => {
  try {
    // Solo traer productos totalmente "activos":
    // - status = 'active'
    // - moderationStatus = 'active'
    // Si en el futuro se desea incluir otros estados, se puede parametrizar con query params.
    const products = await Product.findAll({
      where: { status: "active", moderationStatus: "active" },
      include: [{ model: ProductPhoto }],
    });
    res.json(products);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error al recuperar productos", error: error.message });
  }
};

// =======================================================
// Obtener todos los productos (vista moderación, admin)
// =======================================================
export const getAllProductsModeration = async (req, res) => {
  try {
    const isAdmin = req.user?.roles?.includes("Administrador");
    if (!isAdmin) {
      return res
        .status(403)
        .json({ message: "No autorizado: solo administradores" });
    }

    const products = await Product.findAll({
      include: [
        { model: ProductPhoto, required: false },
        {
          model: User,
          attributes: ["id", "name", "lastname", "email"],
          required: false,
        },
        {
          model: Category,
          attributes: ["id", "name"],
          required: false,
        },
        {
          model: Report,
          attributes: [
            "id",
            "typeReport",
            "description",
            "status",
            "dateReport",
          ],
          required: false,
        },
      ],
      order: [["id", "DESC"]],
    });

    console.log(
      `[getAllProductsModeration] Se encontraron ${products.length} productos`
    );
    res.json(products);
  } catch (error) {
    console.error("[getAllProductsModeration] Error:", error);
    res.status(500).json({
      message: "Error al recuperar productos (moderación)",
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

// =======================================================
// Obtener mis productos (por token)
// =======================================================
export const getMyProducts = async (req, res) => {
  try {
    const userId = req.user.id;
    const products = await Product.findAll({
      where: { sellerId: userId },
      include: [
        { model: ProductPhoto },
        {
          model: Incidence,
          attributes: [
            "id",
            "status",
            "resolution",
            "resolutionNotes",
            "resolvedAt",
          ],
          required: false, // LEFT JOIN para incluir productos sin incidencias
        },
        {
          model: Report,
          as: "Reports", // Especificar el alias explícitamente
          attributes: ["id", "typeReport", "description", "dateReport"],
          required: false, // LEFT JOIN para incluir productos sin reportes
        },
      ],
    });

    // Mapear productos para incluir información de incidencia resuelta
    const mappedProducts = products.map((product) => {
      const productData = product.toJSON();

      console.log(`📦 Producto ${productData.id}:`, {
        Reports: productData.Reports?.length || 0,
        Incidences: productData.Incidences?.length || 0,
        moderationStatus: productData.moderationStatus,
      });

      // Buscar incidencias resueltas
      const incidences = productData.Incidences || [];
      const resolvedIncidence = incidences.find(
        (inc) => inc.status === "resolved" && inc.resolution
      );

      console.log(
        `Producto ${productData.id}: Tiene ${
          incidences.length
        } incidencias, Resuelta: ${!!resolvedIncidence}, Resolution: ${
          resolvedIncidence?.resolution
        }`
      );

      return {
        ...productData,
        hasResolvedIncidence: !!resolvedIncidence,
        incidenceResolution: resolvedIncidence?.resolution || null,
      };
    });

    res.json(mappedProducts);
  } catch (error) {
    res.status(500).json({
      message: "Error al recuperar mis productos",
      error: error.message,
    });
  }
};

// =======================================================
// Obtener producto por ID
// =======================================================
export const getProductById = async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id, {
      include: [{ model: ProductPhoto }],
    });
    if (!product)
      return res.status(404).json({ message: "Producto no encontrado" });
    res.json(product);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error al recuperar producto", error: error.message });
  }
};

// =======================================================
// Crear producto con fotos
// =======================================================
export const createProduct = async (req, res) => {
  try {
    const { title, description, price, categoryId, location, locationCoords } =
      req.body;
    const sellerId = req.user.id; // del token

    const categoryExists = await Category.findByPk(categoryId);
    if (!categoryExists)
      return res.status(404).json({ message: "Categoría no encontrada" });

    const sellerExists = await User.findByPk(sellerId);
    if (!sellerExists)
      return res.status(404).json({ message: "Vendedor no encontrado" });

    // Crear producto
    const product = await Product.create({
      sellerId,
      title,
      description,
      price,
      categoryId,
      location,
      locationCoords: JSON.parse(locationCoords),
      // status no se acepta por POST, queda en default 'active' para moderación
    });

    // Manejo de fotos
    if (req.files && req.files.length > 0) {
      const productFolder = path.join(
        "uploads",
        "products",
        String(product.id)
      );
      if (!fs.existsSync(productFolder)) {
        fs.mkdirSync(productFolder, { recursive: true });
      }

      const photoRecords = [];
      req.files.forEach((file, index) => {
        const finalPath = path.join(productFolder, file.filename);
        fs.renameSync(file.path, finalPath);

        photoRecords.push({
          productId: product.id,
          url: "/" + finalPath.replace(/\\/g, "/"),
          position: index + 1,
        });
      });

      await ProductPhoto.bulkCreate(photoRecords);
    }

    res.status(201).json({ message: "Producto creado con éxito", product });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error al crear producto", error: error.message });
  }
};

// =======================================================
// Actualizar producto
// =======================================================
export const updateProduct = async (req, res) => {
  try {
    const {
      title,
      description,
      price,
      categoryId,
      status,
      location,
      locationCoords,
    } = req.body; // status vuelve a poder editarse por PUT
    const productId = req.params.id;
    const userId = req.user.id;

    const product = await Product.findByPk(productId);
    if (!product)
      return res.status(404).json({ message: "Producto no encontrado" });

    const isAdmin = req.user?.roles?.includes("Administrador");
    if (!isAdmin && product.sellerId !== userId) {
      return res.status(403).json({ message: "No autorizado" });
    }

    if (categoryId) {
      const categoryExists = await Category.findByPk(categoryId);
      if (!categoryExists)
        return res.status(400).json({ message: "Categoría no válida" });
    }

    // Actualizar datos básicos
    await product.update({
      title: title || product.title,
      description: description || product.description,
      price: price || product.price,
      categoryId: categoryId || product.categoryId,
      status: status || product.status,
      location: location || product.location,
      locationCoords: locationCoords
        ? JSON.parse(locationCoords)
        : product.locationCoords,
    });

    // =========================================
    // Manejo de fotos (si se enviaron nuevas)
    // =========================================
    if (req.files && req.files.length > 0) {
      const productFolder = path.join(
        "uploads",
        "products",
        String(product.id)
      );
      if (!fs.existsSync(productFolder)) {
        fs.mkdirSync(productFolder, { recursive: true });
      }

      // 1. Eliminar fotos antiguas de la DB
      await ProductPhoto.destroy({ where: { productId } });

      // 2. Eliminar fotos antiguas del disco
      if (fs.existsSync(productFolder)) {
        fs.rmSync(productFolder, { recursive: true, force: true });
        fs.mkdirSync(productFolder, { recursive: true }); // recrear vacío
      }

      // 3. Guardar las nuevas fotos
      const photoRecords = [];
      req.files.forEach((file, index) => {
        const finalPath = path.join(productFolder, file.filename);
        fs.renameSync(file.path, finalPath);

        photoRecords.push({
          productId: product.id,
          url: "/" + finalPath.replace(/\\/g, "/"),
          position: index + 1,
        });
      });

      await ProductPhoto.bulkCreate(photoRecords);
    }

    res.json({ message: "Producto actualizado con éxito", product });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error al actualizar producto", error: error.message });
  }
};

// =======================================================
// Actualizar parámetro de moderación (solo admin)
// =======================================================
export const updateProductModeration = async (req, res) => {
  try {
    const { moderationStatus } = req.body;
    const productId = req.params.id;

    if (typeof moderationStatus !== "string" || moderationStatus.length === 0) {
      return res
        .status(400)
        .json({ message: "moderationStatus es requerido y debe ser string" });
    }

    const product = await Product.findByPk(productId);
    if (!product)
      return res.status(404).json({ message: "Producto no encontrado" });

    const isAdmin = req.user?.roles?.includes("Administrador");
    const isModerador = req.user?.roles?.includes("Moderador");

    if (!isAdmin && !isModerador) {
      return res.status(403).json({
        message:
          "No autorizado: solo administradores y moderadores pueden modificar moderationStatus",
      });
    }

    const previousModerationStatus = product.moderationStatus;
    await product.update({ moderationStatus });

    // Si se marca como permanently_suspended, también cambiar status a 'restricted'
    if (moderationStatus === "permanently_suspended") {
      await product.update({ status: "restricted" });
      console.log(
        `✅ Producto ${productId} marcado como permanently_suspended y status cambiado a 'restricted'`
      );
    }

    // Crear incidencia automáticamente cuando se cambia a 'review' o 'block'
    // Solo crear si es un cambio nuevo (no si ya existía una incidencia para este estado)
    if (
      (moderationStatus === "review" || moderationStatus === "block") &&
      previousModerationStatus !== moderationStatus
    ) {
      // Verificar si ya existe una incidencia pendiente/en revisión para este producto
      const existingIncidence = await Incidence.findOne({
        where: {
          productId: productId,
          status: { [Op.in]: ["pending", "in_progress"] },
        },
      });

      // Solo crear si no existe una incidencia activa
      if (!existingIncidence) {
        const description =
          moderationStatus === "review"
            ? `Producto marcado para revisión por moderación administrativa`
            : `Producto bloqueado por moderación administrativa`;

        const newIncidence = await Incidence.create({
          dateIncidence: new Date(),
          description,
          userId: req.user.id, // Asignar al moderador/admin que hizo el cambio
          productId: productId,
          status: "pending",
        });

        console.log(
          `✅ Incidencia creada automáticamente: ID ${newIncidence.id} para producto ${productId}`
        );
      } else {
        console.log(
          `ℹ️ Ya existe incidencia activa (ID ${existingIncidence.id}) para producto ${productId}`
        );
      }
    }

    // Si se cambia a 'active', resolver incidencias pendientes automáticamente
    if (
      moderationStatus === "active" &&
      previousModerationStatus !== "active"
    ) {
      const resolvedCount = await Incidence.update(
        { status: "resolved" },
        {
          where: {
            productId: productId,
            status: { [Op.in]: ["pending", "in_progress"] },
          },
        }
      );

      if (resolvedCount[0] > 0) {
        console.log(
          `✅ ${resolvedCount[0]} incidencia(s) resuelta(s) automáticamente para producto ${productId}`
        );
      }
    }

    res.json({
      message: "Moderation status actualizado",
      moderationStatus,
      product,
    });
  } catch (error) {
    console.error("Error en updateProductModeration:", error);
    res.status(500).json({
      message: "Error al actualizar moderationStatus",
      error: error.message,
    });
  }
};

// =======================================================
// Actualizar estado de producto
// =======================================================
export const updateProductStatus = async (req, res) => {
  try {
    const status = req.body.status;
    const productId = req.params.id;
    const validStatuses = [
      "active",
      "sold",
      "inactive",
      "reserved",
      "restricted",
    ]; // agregar 'restricted' para moderación

    if (!validStatuses.includes(status))
      return res.status(400).json({ message: "Status no válido" });

    const product = await Product.findByPk(productId);
    if (!product)
      return res.status(404).json({ message: "Producto no encontrado" });

    const userId = req.user.id;
    const isAdmin = req.user?.roles?.includes("Administrador");
    if (!isAdmin && product.sellerId !== userId) {
      return res.status(403).json({ message: "No autorizado" });
    }

    await product.update({ status });
    res.json({ message: "Status actualizado", newStatus: status, product });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error al actualizar el status", error: error.message });
  }
};

// =======================================================
// Eliminar producto + fotos
// =======================================================
export const deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findByPk(productId);

    if (!product)
      return res.status(404).json({ message: "Producto no encontrado" });

    const userId = req.user.id;
    const isAdmin = req.user?.roles?.includes("Administrador");
    if (!isAdmin && product.sellerId !== userId) {
      return res.status(403).json({ message: "No autorizado" });
    }

    await ProductPhoto.destroy({ where: { productId } });

    const folder = path.join("uploads", "products", String(productId));
    if (fs.existsSync(folder)) {
      fs.rmSync(folder, { recursive: true, force: true });
    }

    await product.destroy();
    res.json({ message: "Producto eliminado", product });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error al eliminar producto", error: error.message });
  }
};
