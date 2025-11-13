import sql, { config } from 'mssql';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
dotenv.config({ path: '../.env.local' });
dotenv.config({ path: '../.env' });
dotenv.config({ path: '../../.env.local' });
dotenv.config({ path: '../../.env' });

function buildConfig(): config {
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

let pool: sql.ConnectionPool | null = null;

export async function getPool() {
  if (pool && pool.connected) return pool;
  if (pool && !pool.connected) await pool.close();
  const cfg = buildConfig();
  pool = await new sql.ConnectionPool(cfg).connect();
  return pool;
}


