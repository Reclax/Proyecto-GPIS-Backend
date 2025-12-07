import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

// Revert: keep only existing columns. `userId` now represents the moderador/administrador asignado.
const Incidence = sequelize.define("Incidence", {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    dateIncidence: { type: DataTypes.DATE, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.ENUM("pending", "in_progress", "resolved"), defaultValue: "pending", allowNull: false },
    userId: { type: DataTypes.BIGINT, allowNull: false }, // moderador / admin asignado
    productId: { type: DataTypes.BIGINT, allowNull: false },
    reportId: { type: DataTypes.BIGINT, allowNull: true }, // Reporte que originó esta incidencia
    appealId: { type: DataTypes.BIGINT, allowNull: true }, // Apelación que originó esta incidencia (si aplica)
    isAppealReview: { type: DataTypes.BOOLEAN, defaultValue: false }, // true si viene de una apelación
    resolutionNotes: { type: DataTypes.TEXT, allowNull: true }, // Observaciones del moderador al resolver
    resolvedAt: { type: DataTypes.DATE, allowNull: true }, // Fecha de resolución
    resolution: { type: DataTypes.ENUM("approved", "rejected", "suspended", "permanently_suspended"), allowNull: true }, // Decisión tomada
}, {
    tableName: "incidences",
    timestamps: false,
});

export default Incidence;