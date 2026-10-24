import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables from root or local .env
const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../../.env'),
];

for (const envFile of envCandidates) {
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile });
  }
}
dotenv.config();

// Resolve database password and connection string
const dbPassword = process.env.DB_PASSWORD || '';
let dbUrl = process.env.DATABASE_URL || 'sqlite:./marketpulse.sqlite';

if (dbPassword && dbUrl.includes('YOUR_POSTGRES_PASSWORD')) {
  dbUrl = dbUrl.replace('YOUR_POSTGRES_PASSWORD', encodeURIComponent(dbPassword));
} else if (dbPassword && (dbUrl.startsWith('postgresql://postgres@') || dbUrl.startsWith('postgres://postgres@'))) {
  dbUrl = dbUrl.replace('postgres@', `postgres:${encodeURIComponent(dbPassword)}@`);
} else if (dbPassword && dbUrl.startsWith('sqlite:')) {
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const dbName = process.env.DB_NAME || 'marketpulse';
  const user = process.env.DB_USER || 'postgres';
  dbUrl = `postgresql://${user}:${encodeURIComponent(dbPassword)}@${host}:${port}/${dbName}`;
}

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  appMode: (process.env.APP_MODE || 'SIMULATED') as 'LIVE' | 'HISTORICAL_REPLAY' | 'SIMULATED' | 'END_OF_DAY',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  mlServiceUrl: process.env.ML_SERVICE_URL || 'http://localhost:8000',
  
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'marketpulse_jwt_access_super_secret_key_2026_dev_env',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'marketpulse_jwt_refresh_super_secret_key_2026_dev_env',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    cookieSecure: process.env.COOKIE_SECURE === 'true',
  },

  rateLimit: {
    maxAttempts: parseInt(process.env.LOGIN_MAX_ATTEMPTS || '5', 10),
    lockoutMinutes: parseInt(process.env.LOGIN_LOCKOUT_MINUTES || '15', 10),
  },

  db: {
    url: dbUrl,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'marketpulse',
    user: process.env.DB_USER || 'postgres',
    password: dbPassword,
    ssl: process.env.DB_SSL === 'true',
  },

  redis: {
    url: process.env.REDIS_URL || 'mock',
  },

  provider: {
    name: process.env.MARKET_DATA_PROVIDER || 'upstox',
    tejhqBaseUrl: process.env.TEJHQ_BASE_URL || 'https://api.tejhq.dev',
    apiVersion: process.env.UPSTOX_API_VERSION || 'v3',
    clientId: process.env.UPSTOX_CLIENT_ID || '',
    clientSecret: process.env.UPSTOX_CLIENT_SECRET || '',
    redirectUri: process.env.UPSTOX_REDIRECT_URI || 'http://localhost:5000/api/provider/upstox/callback',
    accessToken: process.env.UPSTOX_ACCESS_TOKEN || '',
  },

  latencyBudgetMs: parseInt(process.env.REALTIME_LATENCY_BUDGET_MS || '2000', 10),
  replaySpeed: process.env.HISTORICAL_REPLAY_SPEED || '5x',
};
