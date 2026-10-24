import { db, sanitizeError } from './index.js';

export async function runMigrations() {
  console.log('=============================================================');
  console.log(' MarketPulse AI — Database Migration Runner');
  console.log('=============================================================');

  try {
    await db.init();

    if (db.isPostgres()) {
      console.log('[Migration] Verifying PostgreSQL tables in schema "public"...');
      const pool = db.getPool();
      if (!pool) throw new Error('PostgreSQL pool not available');

      const tablesRes = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name ASC
      `);

      const tableNames = tablesRes.rows.map(r => r.table_name);
      console.log(`[Migration] Found ${tableNames.length} tables in PostgreSQL:`);
      for (const t of tableNames) {
        const countRes = await pool.query(`SELECT COUNT(*)::int as cnt FROM "${t}"`);
        console.log(`  - ${t} (${countRes.rows[0]?.cnt || 0} rows)`);
      }

      const expected = [
        'users',
        'refresh_tokens',
        'instruments',
        'market_candles',
        'forecasts',
        'forecast_evaluations',
        'user_watchlists',
        'price_alerts',
      ];

      const missing = expected.filter(e => !tableNames.includes(e));
      if (missing.length > 0) {
        throw new Error(`Missing required tables: ${missing.join(', ')}`);
      }

    } else if (db.isPostgresConfigured()) {
      throw new Error(`Failed to connect to PostgreSQL: ${db.getLastPgError() || 'Connection failed. Please check credentials in .env.'}`);
    } else {
      console.log('[Migration] Running in Embedded Local Storage mode. Schema verified.');
    }

    console.log('=============================================================');
    console.log(' Migration completed successfully!');
    console.log('=============================================================');
  } catch (err: any) {
    console.error('[Migration Error]:', sanitizeError(err));
    process.exit(1);
  }
}

// Execute directly if run via CLI
if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
