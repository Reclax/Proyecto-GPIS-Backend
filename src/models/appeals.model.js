import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const Appeals = sequelize.define("Appeals", {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    dateAppeals:{ type: DataTypes.DATE, allowNull: false},
    description:{ type: DataTypes.TEXT, allowNull: false},
    incidenceId:{ type: DataTypes.BIGINT, allowNull: false, field: "incidenceId"}, // Incidencia que originó esta apelación
    status: { type: DataTypes.ENUM("pending", "converted_to_incidence", "dismissed", "resolved"), defaultValue: "pending", allowNull: false },
    newIncidenceId: { type: DataTypes.BIGINT, allowNull: true }, // Si se convirtió en nueva incidencia (revisión de apelación)
},{
    tableName: "appeals",
    timestamps: false,
});
export default Appeals;

