"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPool = getPool;
const mssql_1 = __importDefault(require("mssql"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: '.env.local' });
dotenv_1.default.config({ path: '.env' });
dotenv_1.default.config({ path: '../.env.local' });
dotenv_1.default.config({ path: '../.env' });
dotenv_1.default.config({ path: '../../.env.local' });
dotenv_1.default.config({ path: '../../.env' });
function buildConfig() {
    return {
        server: process.env.DB_SERVER || 'riskmanage.database.windows.net',
        database: process.env.DB_NAME || 'riskmanagement',
        user: process.env.DB_USER || 'riskmanagement',
        password: process.env.DB_PASSWORD || 'RiskManage@123',
        port: Number(process.env.DB_PORT) || 1433,
        options: {
            encrypt: true,
            trustServerCertificate: false
        },
        pool: {
            max: 10,
            min: 0,
            idleTimeoutMillis: 30000
        }
    };
}
let pool = null;
async function getPool() {
    if (pool && pool.connected)
        return pool;
    if (pool && !pool.connected)
        await pool.close();
    const cfg = buildConfig();
    pool = await new mssql_1.default.ConnectionPool(cfg).connect();
    return pool;
}
