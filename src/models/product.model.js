import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const Product = sequelize.define(
  "Product",
  {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    sellerId: { type: DataTypes.BIGINT, allowNull: false, field: "seller_id" },
    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    price: { type: DataTypes.FLOAT, allowNull: false },
    categoryId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      field: "category_id",
    },
    location: { type: DataTypes.STRING, allowNull: true },
    locationCoords: {
      type: DataTypes.JSON,
      allowNull: true,
      validate: {
        isValidCoords(value) {
          // Debe ser un objeto
          if (typeof value !== "object" || value === null) {
            throw new Error("coordenadas debe ser un objeto");
          }

          // Claves exactas esperadas
          const keys = Object.keys(value);
          const permitidas = ["lat", "lng"];

          // Verifica que solo existan x e y
          const extra = keys.filter((k) => !permitidas.includes(k));
          if (extra.length > 0) {
            throw new Error(`Propiedades no permitidas: ${extra.join(", ")}`);
          }

          // Verifica que x e y sean números válidos
          if (
            typeof value.lat !== "number" ||
            isNaN(value.lat) ||
            typeof value.lng !== "number" ||
            isNaN(value.lng)
          ) {
            throw new Error("x e y deben ser números válidos");
          }
        },
      },
    },
    status: {
      type: DataTypes.ENUM(
        "active",
        "sold",
        "inactive",
        "reserved",
        "restricted"
      ),
      allowNull: false,
      defaultValue: "active", // default para moderación: los productos nuevos quedan activos
    },
    moderationStatus: {
      type: DataTypes.ENUM(
        "active",
        "review",
        "flagged",
        "suspended",
        "permanently_suspended"
      ),
      allowNull: false,
      defaultValue: "active",
      field: "moderation_status",
    },
  },
  {
    tableName: "products",
    timestamps: false,
  }
);

export default Product;
