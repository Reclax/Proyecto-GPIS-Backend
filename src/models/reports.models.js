import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";


const Reports = sequelize.define("Reports", {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    dateReport:{ type: DataTypes.DATE, allowNull: false},
    typeReport:{  type: DataTypes.TEXT, allowNull: false},
    description:{ type: DataTypes.TEXT, allowNull: false},
    userId:{ type: DataTypes.BIGINT, allowNull: false, field: "userId"},
    productId:{ type: DataTypes.BIGINT, allowNull: false, field: "productId"},
    status: { type: DataTypes.ENUM("pending", "converted_to_incidence", "dismissed"), defaultValue: "pending", allowNull: false }, // Estado del reporte
    incidenceId: { type: DataTypes.BIGINT, allowNull: true }, // Si se convirtió en incidencia, referencia a ella
},{tableName: "reports",
  timestamps: false,
});
export default Reports;
