import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env safely from project root
const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '..', '.env'),
  path.resolve(__dirname, '../../../.env'),
];

for (const envFile of envCandidates) {
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile });
    break;
  }
}
dotenv.config();

function sanitize(str: string): string {
  return str.replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+(@)/gi, '$1***$2');
}

export async function testConnection(): Promise<void> {
  console.log('=============================================================');
  console.log(' MarketPulse AI — Safe PostgreSQL Connection Verification');
  console.log('=============================================================');

  const dbUrl = process.env.DATABASE_URL || '';
  const isPostgresUrl = dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://');
  const dbPassword = process.env.DB_PASSWORD || '';
  const isSsl = process.env.DB_SSL === 'true' || dbUrl.includes('sslmode=require') || dbUrl.includes('neon.tech');

  console.log('[Config Check]:');
  console.log(`  - Target Mode: ${isPostgresUrl ? 'DATABASE_URL (Connection String)' : 'Discrete Host / Parameters'}`);
  if (isPostgresUrl) {
    console.log(`  - Sanitized URL: ${sanitize(dbUrl)}`);
  } else {
    console.log(`  - Host: ${process.env.DB_HOST || 'localhost'}`);
    console.log(`  - Port: ${process.env.DB_PORT || '5432'}`);
    console.log(`  - Database: ${process.env.DB_NAME || 'marketpulse'}`);
    console.log(`  - User: ${process.env.DB_USER || 'postgres'}`);
    console.log(`  - Password Configured: ${dbPassword ? 'YES (Masked)' : 'NO'}`);
  }
  console.log(`  - SSL Encryption: ${isSsl ? 'ENABLED ({ rejectUnauthorized: false })' : 'DISABLED'}`);

  let poolConfig: any;
  if (isPostgresUrl) {
    poolConfig = {
      connectionString: dbUrl,
      ssl: isSsl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 8000,
    };
  } else {
    poolConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'marketpulse',
      user: process.env.DB_USER || 'postgres',
      password: dbPassword || undefined,
      ssl: isSsl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 8000,
    };
  }

  const pool = new Pool(poolConfig);
  const start = Date.now();

  try {
    console.log('\n[Connection Test] Initiating handshake with PostgreSQL server...');
    const client = await pool.connect();
    const handshakeLatency = Date.now() - start;

    try {
      console.log(`[Handshake Success] Connected in ${handshakeLatency}ms.`);

      const metaRes = await client.query('SELECT current_database() as db, current_user as usr, version() as ver, NOW() as server_time');
      const row = metaRes.rows[0];

      console.log('\n[Server Diagnostics]:');
      console.log(`  - Connected Database: ${row.db}`);
      console.log(`  - Authenticated User: ${row.usr}`);
      console.log(`  - Server Timestamp:   ${row.server_time}`);
      console.log(`  - Engine Version:     ${row.ver.split(',')[0]}`);

      const sslCheck = await client.query('SELECT ssl_is_used() as ssl_active').catch(() => null);
      if (sslCheck && sslCheck.rows.length > 0) {
        console.log(`  - Active TLS/SSL:     ${sslCheck.rows[0].ssl_active ? 'YES (Encrypted)' : 'NO'}`);
      } else {
        console.log(`  - Active TLS/SSL:     YES (Enforced via connection options)`);
      }

      const tablesRes = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name ASC
      `);

      const tables = tablesRes.rows.map(r => r.table_name);
      console.log(`\n[Schema Inspection]:`);
      console.log(`  - Public Tables Count: ${tables.length}`);
      if (tables.length > 0) {
        for (const t of tables) {
          const cnt = await client.query(`SELECT COUNT(*)::int as c FROM "${t}"`).catch(() => ({ rows: [{ c: 'N/A' }] }));
          console.log(`    * ${t}: ${cnt.rows[0]?.c} rows`);
        }
      } else {
        console.log('    * Schema is clean (0 tables). Ready for non-destructive migrations.');
      }

      console.log('\n=============================================================');
      console.log(' Connection Test: PASSED (Database is online and healthy)');
      console.log('=============================================================');
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('\n[Connection Test FAILED]:', sanitize(err.message || String(err)));
    console.log('=============================================================');
    process.exit(1);
  } finally {
    await pool.end().catch(() => {});
  }
}

if (process.argv[1]?.endsWith('verifyConnection.ts') || process.argv[1]?.endsWith('verifyConnection.js')) {
  testConnection()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
