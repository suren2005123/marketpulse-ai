import { Pool, PoolConfig } from 'pg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config/index.js';

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export function sanitizeError(err: any): string {
  if (!err) return 'Unknown error';
  const msg = typeof err === 'string' ? err : err.message || String(err);
  return msg.replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+(@)/gi, '$1***$2');
}

class DatabaseService {
  private pgPool: Pool | null = null;
  private isPg = false;
  private isConfiguredPg = false;
  private lastPgError: string | null = null;
  private localStorePath: string;
  private localData: {
    users: any[];
    refresh_tokens: any[];
    instruments: any[];
    market_candles: any[];
    forecasts: any[];
    forecast_evaluations: any[];
    user_watchlists: any[];
    price_alerts: any[];
  };

  constructor() {
    this.localStorePath = path.resolve(process.cwd(), 'marketpulse_db.json');
    this.localData = {
      users: [],
      refresh_tokens: [],
      instruments: [],
      market_candles: [],
      forecasts: [],
      forecast_evaluations: [],
      user_watchlists: [],
      price_alerts: [],
    };
  }

  isPostgres(): boolean {
    return this.isPg;
  }

  isPostgresConfigured(): boolean {
    return this.isConfiguredPg;
  }

  getLastPgError(): string | null {
    return this.lastPgError;
  }

  getPool(): Pool | null {
    return this.pgPool;
  }

  private resolvePgConfig(): PoolConfig | null {
    const isPostgresUrl = config.db.url.startsWith('postgres://') || config.db.url.startsWith('postgresql://');
    const pgPassword = config.db.password || process.env.DB_PASSWORD || '';

    // If discrete credentials with password are provided, prefer discrete object for guaranteed connection accuracy
    if (config.db.host && config.db.database && config.db.user && pgPassword) {
      this.isConfiguredPg = true;
      return {
        host: config.db.host,
        port: config.db.port,
        database: config.db.database,
        user: config.db.user,
        password: pgPassword,
        ssl: config.db.ssl ? { rejectUnauthorized: false } : undefined,
        connectionTimeoutMillis: 5000,
      };
    }

    if (isPostgresUrl) {
      this.isConfiguredPg = true;
      return {
        connectionString: config.db.url,
        password: pgPassword || undefined,
        ssl: config.db.ssl ? { rejectUnauthorized: false } : undefined,
        connectionTimeoutMillis: 5000,
      };
    }

    const hasPgTarget = config.db.host === 'localhost' && config.db.database === 'marketpulse';
    if (hasPgTarget || pgPassword) {
      this.isConfiguredPg = true;
      return {
        host: config.db.host,
        port: config.db.port,
        database: config.db.database,
        user: config.db.user,
        password: pgPassword,
        ssl: config.db.ssl ? { rejectUnauthorized: false } : undefined,
        connectionTimeoutMillis: 5000,
      };
    }

    return null;
  }

  async init(): Promise<void> {
    const pgConfig = this.resolvePgConfig();

    if (pgConfig) {
      try {
        await this.connectPostgres(pgConfig);
        this.lastPgError = null;
        return;
      } catch (err: any) {
        this.lastPgError = sanitizeError(err);
        console.error(`[DB] PostgreSQL connection error: ${this.lastPgError}`);
        if (this.pgPool) {
          await this.pgPool.end().catch(() => {});
        }
        this.isPg = false;
        this.pgPool = null;
      }
    }

    // Initialize local JSON storage fallback
    this.loadLocalData();
    console.log('[DB] Embedded high-performance store initialized.');
  }

  private async connectPostgres(pgConfig: PoolConfig): Promise<void> {
    try {
      this.pgPool = new Pool(pgConfig);
      await this.pgPool.query('SELECT 1');
      this.isPg = true;
      console.log('[DB] Connected successfully to PostgreSQL.');
      await this.runPgMigrations();
      await this.syncFromPg();
    } catch (err: any) {
      // If error code is 3D000 (database does not exist), attempt automatic database creation
      if (err.code === '3D000' || String(err.message).includes('database "marketpulse" does not exist')) {
        console.log('[DB] Target database "marketpulse" does not exist. Attempting auto-creation via default maintenance database...');
        if (this.pgPool) {
          await this.pgPool.end().catch(() => {});
          this.pgPool = null;
        }
        await this.createDatabaseIfMissing(pgConfig);
        // Retry connection to marketpulse
        this.pgPool = new Pool(pgConfig);
        await this.pgPool.query('SELECT 1');
        this.isPg = true;
        console.log('[DB] Connected successfully to newly created "marketpulse" PostgreSQL database.');
        await this.runPgMigrations();
        await this.syncFromPg();
      } else {
        if (this.pgPool) {
          await this.pgPool.end().catch(() => {});
          this.pgPool = null;
        }
        throw err;
      }
    }
  }

  private async createDatabaseIfMissing(pgConfig: PoolConfig): Promise<void> {
    const maintenanceConfig = {
      ...pgConfig,
      database: 'postgres',
    };
    if (maintenanceConfig.connectionString) {
      maintenanceConfig.connectionString = maintenanceConfig.connectionString.replace(/\/marketpulse(?:\?|$)/, '/postgres$1');
    }

    const adminPool = new Pool(maintenanceConfig);
    try {
      const checkRes = await adminPool.query("SELECT 1 FROM pg_database WHERE datname = 'marketpulse'");
      if (checkRes.rowCount === 0) {
        await adminPool.query('CREATE DATABASE marketpulse');
        console.log('[DB] PostgreSQL database "marketpulse" created successfully.');
      }
    } finally {
      await adminPool.end().catch(() => {});
    }
  }

  private loadLocalData() {
    if (fs.existsSync(this.localStorePath)) {
      try {
        const raw = fs.readFileSync(this.localStorePath, 'utf8');
        this.localData = JSON.parse(raw);
      } catch (e) {
        console.error('[DB] Failed reading local database file. Initializing fresh store.');
      }
    }
  }

  saveLocalData() {
    try {
      fs.writeFileSync(this.localStorePath, JSON.stringify(this.localData, null, 2), 'utf8');
    } catch (e) {
      console.error('[DB] Failed saving local data:', e);
    }
  }

  async syncFromPg(): Promise<void> {
    if (!this.pgPool || !this.isPg) return;
    try {
      const [users, tokens, insts, candles, fcs, evals, watchlists, alerts] = await Promise.all([
        this.pgPool.query('SELECT * FROM users'),
        this.pgPool.query('SELECT * FROM refresh_tokens'),
        this.pgPool.query('SELECT * FROM instruments WHERE active = true'),
        this.pgPool.query('SELECT * FROM market_candles ORDER BY candle_start ASC'),
        this.pgPool.query('SELECT * FROM forecasts ORDER BY issued_at DESC'),
        this.pgPool.query('SELECT * FROM forecast_evaluations'),
        this.pgPool.query('SELECT * FROM user_watchlists'),
        this.pgPool.query('SELECT * FROM price_alerts'),
      ]);

      this.localData.users = users.rows;
      this.localData.refresh_tokens = tokens.rows;
      this.localData.instruments = insts.rows;
      this.localData.market_candles = candles.rows;
      this.localData.forecasts = fcs.rows;
      this.localData.forecast_evaluations = evals.rows;
      this.localData.user_watchlists = watchlists.rows;
      this.localData.price_alerts = alerts.rows;

      console.log(`[DB] Synchronized PostgreSQL cache: ${users.rowCount} users, ${insts.rowCount} instruments, ${candles.rowCount} candles, ${fcs.rowCount} forecasts, ${alerts.rowCount} alerts.`);
    } catch (err: any) {
      console.error('[DB] Synchronization warning:', sanitizeError(err));
    }
  }

  async runPgMigrations(): Promise<void> {
    if (!this.pgPool) return;
    const migrationSql = `
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        role VARCHAR(20) DEFAULT 'user',
        email_verified BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        last_login_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) NOT NULL,
        issued_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        replaced_by_token_id VARCHAR(36)
      );

      CREATE TABLE IF NOT EXISTS instruments (
        id VARCHAR(36) PRIMARY KEY,
        exchange VARCHAR(10) NOT NULL,
        symbol VARCHAR(30) NOT NULL,
        name VARCHAR(150) NOT NULL,
        sector VARCHAR(100),
        provider_instrument_key VARCHAR(100),
        active BOOLEAN DEFAULT true,
        UNIQUE(exchange, symbol)
      );

      CREATE TABLE IF NOT EXISTS market_candles (
        id VARCHAR(36) PRIMARY KEY,
        instrument_id VARCHAR(36) NOT NULL REFERENCES instruments(id),
        candle_start TIMESTAMPTZ NOT NULL,
        interval VARCHAR(10) NOT NULL DEFAULT '1m',
        open NUMERIC(12, 2) NOT NULL,
        high NUMERIC(12, 2) NOT NULL,
        low NUMERIC(12, 2) NOT NULL,
        close NUMERIC(12, 2) NOT NULL,
        volume BIGINT NOT NULL,
        source_mode VARCHAR(20) NOT NULL,
        provider VARCHAR(50) NOT NULL,
        received_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS forecasts (
        id VARCHAR(36) PRIMARY KEY,
        instrument_id VARCHAR(36) NOT NULL REFERENCES instruments(id),
        issued_at TIMESTAMPTZ NOT NULL,
        target_time TIMESTAMPTZ NOT NULL,
        horizon_minutes INT NOT NULL,
        anchor_price NUMERIC(12, 2) NOT NULL,
        predicted_price NUMERIC(12, 2) NOT NULL,
        lower_bound NUMERIC(12, 2) NOT NULL,
        upper_bound NUMERIC(12, 2) NOT NULL,
        probability_up NUMERIC(6, 4),
        model_version VARCHAR(50) NOT NULL,
        source_mode VARCHAR(20) NOT NULL,
        evaluation_status VARCHAR(20) DEFAULT 'PENDING'
      );

      CREATE TABLE IF NOT EXISTS forecast_evaluations (
        id VARCHAR(36) PRIMARY KEY,
        forecast_id VARCHAR(36) NOT NULL REFERENCES forecasts(id) ON DELETE CASCADE,
        actual_price NUMERIC(12, 2) NOT NULL,
        absolute_error NUMERIC(12, 2) NOT NULL,
        directional_correctness BOOLEAN NOT NULL,
        inside_interval BOOLEAN NOT NULL,
        evaluation_timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_watchlists (
        user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        instrument_id VARCHAR(36) NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
        added_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, instrument_id)
      );

      CREATE TABLE IF NOT EXISTS price_alerts (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        instrument_id VARCHAR(36) NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
        condition_type VARCHAR(50) NOT NULL,
        threshold NUMERIC(12, 2) NOT NULL,
        active BOOLEAN DEFAULT true,
        triggered_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_candles_time ON market_candles(instrument_id, candle_start DESC);
      CREATE INDEX IF NOT EXISTS idx_forecasts_target ON forecasts(instrument_id, target_time DESC);
      CREATE INDEX IF NOT EXISTS idx_alerts_user ON price_alerts(user_id, active);

      -- Deduplicate candles before unique index creation
      DELETE FROM market_candles a USING market_candles b
      WHERE a.id > b.id
        AND a.instrument_id = b.instrument_id
        AND a.interval = b.interval
        AND a.candle_start = b.candle_start;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_candles_instrument_interval_time 
      ON market_candles(instrument_id, interval, candle_start);
    `;
    await this.pgPool.query(migrationSql);
    console.log('[DB] PostgreSQL schema & indexes migrated successfully.');
  }

  // Health check method
  async checkHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    connected: boolean;
    engine: 'PostgreSQL' | 'Embedded Local Storage';
    database: string;
    version?: string;
    latencyMs: number;
    tables?: { [key: string]: number };
    error?: string;
  }> {
    const start = Date.now();
    if (this.isPg && this.pgPool) {
      try {
        const infoRes = await this.pgPool.query('SELECT current_database() as db_name, version() as pg_version');
        const latency = Date.now() - start;
        const [users, insts, candles, fcs] = await Promise.all([
          this.pgPool.query('SELECT COUNT(*)::int as count FROM users'),
          this.pgPool.query('SELECT COUNT(*)::int as count FROM instruments'),
          this.pgPool.query('SELECT COUNT(*)::int as count FROM market_candles'),
          this.pgPool.query('SELECT COUNT(*)::int as count FROM forecasts'),
        ]);

        return {
          status: 'healthy',
          connected: true,
          engine: 'PostgreSQL',
          database: infoRes.rows[0]?.db_name || 'marketpulse',
          version: infoRes.rows[0]?.pg_version?.split(',')[0] || 'PostgreSQL 18',
          latencyMs: latency,
          tables: {
            users: users.rows[0]?.count || 0,
            instruments: insts.rows[0]?.count || 0,
            market_candles: candles.rows[0]?.count || 0,
            forecasts: fcs.rows[0]?.count || 0,
          },
        };
      } catch (err: any) {
        return {
          status: 'unhealthy',
          connected: false,
          engine: 'PostgreSQL',
          database: config.db.database,
          latencyMs: Date.now() - start,
          error: sanitizeError(err),
        };
      }
    }

    // Local fallback health
    return {
      status: 'healthy',
      connected: true,
      engine: 'Embedded Local Storage',
      database: 'marketpulse_db.json',
      latencyMs: Date.now() - start,
      tables: {
        users: this.localData.users.length,
        instruments: this.localData.instruments.length,
        market_candles: this.localData.market_candles.length,
        forecasts: this.localData.forecasts.length,
      },
    };
  }

  // Database Write & Persistence Helpers
  async insertUser(user: {
    id: string;
    email: string;
    password_hash: string;
    display_name: string;
    role?: string;
    email_verified?: boolean;
    created_at?: string;
    last_login_at?: string;
  }): Promise<void> {
    if (this.isPg && this.pgPool) {
      await this.pgPool.query(
        `INSERT INTO users (id, email, password_hash, display_name, role, email_verified, created_at, last_login_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (email) DO NOTHING`,
        [
          user.id,
          user.email,
          user.password_hash,
          user.display_name,
          user.role || 'user',
          user.email_verified ?? true,
          user.created_at || new Date().toISOString(),
          user.last_login_at || new Date().toISOString(),
        ]
      );
    }
    const idx = this.localData.users.findIndex(u => u.email === user.email);
    if (idx === -1) {
      this.localData.users.push(user);
    } else {
      this.localData.users[idx] = user;
    }
    this.saveLocalData();
  }

  async updateUserLastLogin(userId: string): Promise<void> {
    const now = new Date().toISOString();
    if (this.isPg && this.pgPool) {
      await this.pgPool.query('UPDATE users SET last_login_at = $1 WHERE id = $2', [now, userId]).catch(() => {});
    }
    const u = this.localData.users.find(item => item.id === userId);
    if (u) {
      u.last_login_at = now;
      this.saveLocalData();
    }
  }

  async insertRefreshToken(record: {
    id: string;
    user_id: string;
    token_hash: string;
    issued_at: string;
    expires_at: string;
    revoked_at: string | null;
    replaced_by_token_id: string | null;
  }): Promise<void> {
    if (this.isPg && this.pgPool) {
      await this.pgPool.query(
        `INSERT INTO refresh_tokens (id, user_id, token_hash, issued_at, expires_at, revoked_at, replaced_by_token_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          record.id,
          record.user_id,
          record.token_hash,
          record.issued_at,
          record.expires_at,
          record.revoked_at,
          record.replaced_by_token_id,
        ]
      ).catch(() => {});
    }
    this.localData.refresh_tokens.push(record);
    this.saveLocalData();
  }

  async revokeRefreshToken(tokenHash: string, replacedByTokenId: string | null = null): Promise<void> {
    const now = new Date().toISOString();
    if (this.isPg && this.pgPool) {
      await this.pgPool.query(
        'UPDATE refresh_tokens SET revoked_at = $1, replaced_by_token_id = $2 WHERE token_hash = $3',
        [now, replacedByTokenId, tokenHash]
      ).catch(() => {});
    }
    const t = this.localData.refresh_tokens.find(item => item.token_hash === tokenHash);
    if (t) {
      t.revoked_at = now;
      t.replaced_by_token_id = replacedByTokenId;
      this.saveLocalData();
    }
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    const now = new Date().toISOString();
    if (this.isPg && this.pgPool) {
      await this.pgPool.query('UPDATE refresh_tokens SET revoked_at = $1 WHERE user_id = $2', [now, userId]).catch(() => {});
    }
    for (const t of this.localData.refresh_tokens) {
      if (t.user_id === userId) {
        t.revoked_at = now;
      }
    }
    this.saveLocalData();
  }

  async insertWatchlist(userId: string, instrumentId: string): Promise<void> {
    const now = new Date().toISOString();
    if (this.isPg && this.pgPool) {
      await this.pgPool.query(
        'INSERT INTO user_watchlists (user_id, instrument_id, added_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [userId, instrumentId, now]
      ).catch(() => {});
    }
    const exists = this.localData.user_watchlists.some(w => w.user_id === userId && w.instrument_id === instrumentId);
    if (!exists) {
      this.localData.user_watchlists.push({ user_id: userId, instrument_id: instrumentId, added_at: now });
      this.saveLocalData();
    }
  }

  async removeWatchlist(userId: string, instrumentId: string): Promise<void> {
    if (this.isPg && this.pgPool) {
      await this.pgPool.query(
        'DELETE FROM user_watchlists WHERE user_id = $1 AND instrument_id = $2',
        [userId, instrumentId]
      ).catch(() => {});
    }
    this.localData.user_watchlists = this.localData.user_watchlists.filter(
      w => !(w.user_id === userId && w.instrument_id === instrumentId)
    );
    this.saveLocalData();
  }

  async insertAlert(alert: any): Promise<void> {
    if (this.isPg && this.pgPool) {
      await this.pgPool.query(
        `INSERT INTO price_alerts (id, user_id, instrument_id, condition_type, threshold, active, triggered_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          alert.id,
          alert.user_id,
          alert.instrument_id,
          alert.condition_type,
          alert.threshold,
          alert.active,
          alert.triggered_at,
          alert.created_at,
        ]
      ).catch(() => {});
    }
    this.localData.price_alerts.push(alert);
    this.saveLocalData();
  }

  async updateAlert(id: string, userId: string, updates: { active?: boolean; threshold?: number }): Promise<void> {
    if (this.isPg && this.pgPool) {
      if (updates.active !== undefined && updates.threshold !== undefined) {
        await this.pgPool.query(
          'UPDATE price_alerts SET active = $1, threshold = $2 WHERE id = $3 AND user_id = $4',
          [updates.active, updates.threshold, id, userId]
        ).catch(() => {});
      } else if (updates.active !== undefined) {
        await this.pgPool.query(
          'UPDATE price_alerts SET active = $1 WHERE id = $2 AND user_id = $3',
          [updates.active, id, userId]
        ).catch(() => {});
      } else if (updates.threshold !== undefined) {
        await this.pgPool.query(
          'UPDATE price_alerts SET threshold = $1 WHERE id = $2 AND user_id = $3',
          [updates.threshold, id, userId]
        ).catch(() => {});
      }
    }
    const a = this.localData.price_alerts.find(item => item.id === id && item.user_id === userId);
    if (a) {
      if (updates.active !== undefined) a.active = updates.active;
      if (updates.threshold !== undefined) a.threshold = updates.threshold;
      this.saveLocalData();
    }
  }

  async deleteAlert(id: string, userId: string): Promise<void> {
    if (this.isPg && this.pgPool) {
      await this.pgPool.query('DELETE FROM price_alerts WHERE id = $1 AND user_id = $2', [id, userId]).catch(() => {});
    }
    this.localData.price_alerts = this.localData.price_alerts.filter(
      a => !(a.id === id && a.user_id === userId)
    );
    this.saveLocalData();
  }

  async upsertCandle(candle: any): Promise<void> {
    const interval = candle.interval || '1m';
    const candleId = candle.id || crypto.randomUUID();
    const receivedAt = candle.received_at || new Date().toISOString();

    if (this.isPg && this.pgPool) {
      await this.pgPool.query(
        `INSERT INTO market_candles (id, instrument_id, candle_start, interval, open, high, low, close, volume, source_mode, provider, received_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (instrument_id, interval, candle_start) DO UPDATE SET
           open = EXCLUDED.open,
           high = EXCLUDED.high,
           low = EXCLUDED.low,
           close = EXCLUDED.close,
           volume = EXCLUDED.volume,
           source_mode = EXCLUDED.source_mode,
           provider = EXCLUDED.provider,
           received_at = EXCLUDED.received_at`,
        [
          candleId,
          candle.instrument_id,
          candle.candle_start,
          interval,
          candle.open,
          candle.high,
          candle.low,
          candle.close,
          candle.volume,
          candle.source_mode || 'END_OF_DAY',
          candle.provider || 'TejHQ',
          receivedAt,
        ]
      ).catch((err: any) => {
        console.error('[DB Upsert Candle Error]:', err.message);
      });
    }

    const candleTime = new Date(candle.candle_start).getTime();
    const existingIdx = this.localData.market_candles.findIndex(
      c => c.instrument_id === candle.instrument_id &&
           (c.interval || '1m') === interval &&
           new Date(c.candle_start).getTime() === candleTime
    );

    const record = {
      ...candle,
      id: candleId,
      interval,
      received_at: receivedAt,
    };

    if (existingIdx >= 0) {
      this.localData.market_candles[existingIdx] = {
        ...this.localData.market_candles[existingIdx],
        ...record,
      };
    } else {
      this.localData.market_candles.push(record);
    }
    this.saveLocalData();
  }

  async insertCandle(candle: any): Promise<void> {
    return this.upsertCandle(candle);
  }

  async upsertInstrument(inst: {
    id?: string;
    exchange: string;
    symbol: string;
    name: string;
    sector?: string;
    provider_instrument_key?: string;
    active?: boolean;
  }): Promise<void> {
    const ex = inst.exchange.toUpperCase();
    const sym = inst.symbol.toUpperCase();
    const id = inst.id || `inst-${ex.toLowerCase()}-${sym.toLowerCase()}`;
    const active = inst.active !== undefined ? inst.active : true;
    const sector = inst.sector || 'Equities';
    const providerKey = inst.provider_instrument_key || null;

    if (this.isPg && this.pgPool) {
      await this.pgPool.query(
        `INSERT INTO instruments (id, exchange, symbol, name, sector, provider_instrument_key, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (exchange, symbol) DO UPDATE SET
           name = EXCLUDED.name,
           sector = COALESCE(EXCLUDED.sector, instruments.sector),
           provider_instrument_key = COALESCE(EXCLUDED.provider_instrument_key, instruments.provider_instrument_key),
           active = EXCLUDED.active`,
        [id, ex, sym, inst.name, sector, providerKey, active]
      ).catch((err: any) => {
        console.error('[DB Upsert Instrument Error]:', err.message);
      });
    }

    const existingIdx = this.localData.instruments.findIndex(
      i => i.exchange.toUpperCase() === ex && i.symbol.toUpperCase() === sym
    );

    const fullRecord = {
      id,
      exchange: ex,
      symbol: sym,
      name: inst.name,
      sector,
      provider_instrument_key: providerKey,
      active,
    };

    if (existingIdx >= 0) {
      this.localData.instruments[existingIdx] = {
        ...this.localData.instruments[existingIdx],
        ...fullRecord,
      };
    } else {
      this.localData.instruments.push(fullRecord);
    }
    this.saveLocalData();
  }

  async batchUpsertInstruments(instruments: Array<{
    id?: string;
    exchange: string;
    symbol: string;
    name: string;
    sector?: string;
    provider_instrument_key?: string;
    active?: boolean;
  }>): Promise<number> {
    for (const inst of instruments) {
      await this.upsertInstrument(inst);
    }
    return instruments.length;
  }

  async insertForecast(fc: any): Promise<void> {
    if (this.isPg && this.pgPool) {
      await this.pgPool.query(
        `INSERT INTO forecasts (id, instrument_id, issued_at, target_time, horizon_minutes, anchor_price, predicted_price, lower_bound, upper_bound, probability_up, model_version, source_mode, evaluation_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO NOTHING`,
        [
          fc.id,
          fc.instrument_id,
          fc.issued_at,
          fc.target_time,
          fc.horizon_minutes,
          fc.anchor_price,
          fc.predicted_price,
          fc.lower_bound,
          fc.upper_bound,
          fc.probability_up,
          fc.model_version,
          fc.source_mode,
          fc.evaluation_status || 'PENDING',
        ]
      ).catch(() => {});
    }
    this.localData.forecasts.push(fc);
    this.saveLocalData();
  }

  async insertEvaluation(evalRecord: any): Promise<void> {
    if (this.isPg && this.pgPool) {
      await this.pgPool.query(
        `INSERT INTO forecast_evaluations (id, forecast_id, actual_price, absolute_error, directional_correctness, inside_interval, evaluation_timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [
          evalRecord.id,
          evalRecord.forecast_id,
          evalRecord.actual_price,
          evalRecord.absolute_error,
          evalRecord.directional_correctness,
          evalRecord.inside_interval,
          evalRecord.evaluation_timestamp || new Date().toISOString(),
        ]
      ).catch(() => {});
    }
    this.localData.forecast_evaluations.push(evalRecord);
    this.saveLocalData();
  }

  // Generic query method
  async query<T = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
    if (this.isPg && this.pgPool) {
      const res = await this.pgPool.query(sql, params);
      return { rows: res.rows, rowCount: res.rowCount || 0 };
    }

    return this.executeLocalQuery<T>(sql, params);
  }

  // Local embedded repository accessors
  get store() {
    return this.localData;
  }

  private executeLocalQuery<T = any>(sql: string, params: any[]): QueryResult<T> {
    const s = sql.trim().toLowerCase();

    if (s.startsWith('select')) {
      return this.handleLocalSelect<T>(sql, params);
    } else if (s.startsWith('insert')) {
      return this.handleLocalInsert<T>(sql, params);
    } else if (s.startsWith('update')) {
      return this.handleLocalUpdate<T>(sql, params);
    } else if (s.startsWith('delete')) {
      return this.handleLocalDelete<T>(sql, params);
    }

    return { rows: [], rowCount: 0 };
  }

  private handleLocalSelect<T>(sql: string, params: any[]): QueryResult<T> {
    const lower = sql.toLowerCase();
    let tableName = '';
    const tableNames = ['users', 'refresh_tokens', 'instruments', 'market_candles', 'forecasts', 'forecast_evaluations', 'user_watchlists', 'price_alerts'];
    
    for (const t of tableNames) {
      if (lower.includes(`from ${t}`)) {
        tableName = t;
        break;
      }
    }

    if (!tableName || !(tableName in this.localData)) {
      return { rows: [], rowCount: 0 };
    }

    let records = [...(this.localData as any)[tableName]];

    if (lower.includes('where')) {
      if (tableName === 'users' && lower.includes('email = $1')) {
        records = records.filter(u => u.email.toLowerCase() === String(params[0]).toLowerCase());
      } else if (tableName === 'users' && lower.includes('id = $1')) {
        records = records.filter(u => u.id === params[0]);
      } else if (tableName === 'refresh_tokens' && lower.includes('token_hash = $1')) {
        records = records.filter(t => t.token_hash === params[0]);
      } else if (tableName === 'instruments' && lower.includes('symbol = $1')) {
        records = records.filter(i => i.symbol.toUpperCase() === String(params[0]).toUpperCase());
      } else if (tableName === 'instruments' && lower.includes('id = $1')) {
        records = records.filter(i => i.id === params[0]);
      } else if (tableName === 'user_watchlists' && lower.includes('user_id = $1')) {
        records = records.filter(w => w.user_id === params[0]);
      } else if (tableName === 'price_alerts' && lower.includes('user_id = $1')) {
        records = records.filter(a => a.user_id === params[0]);
        if (lower.includes('id = $2')) {
          records = records.filter(a => a.id === params[1]);
        }
      } else if (tableName === 'forecasts' && lower.includes('instrument_id = $1')) {
        records = records.filter(f => f.instrument_id === params[0]);
      } else if (tableName === 'market_candles' && lower.includes('instrument_id = $1')) {
        records = records.filter(c => c.instrument_id === params[0]);
      }
    }

    if (tableName === 'user_watchlists' && lower.includes('join instruments')) {
      const enriched = records.map(w => {
        const inst = this.localData.instruments.find(i => i.id === w.instrument_id);
        return {
          ...w,
          symbol: inst?.symbol,
          exchange: inst?.exchange,
          name: inst?.name,
          sector: inst?.sector,
        };
      });
      return { rows: enriched as any, rowCount: enriched.length };
    }

    if (tableName === 'price_alerts' && lower.includes('join instruments')) {
      const enriched = records.map(a => {
        const inst = this.localData.instruments.find(i => i.id === a.instrument_id);
        return {
          ...a,
          symbol: inst?.symbol,
          exchange: inst?.exchange,
          instrument_name: inst?.name,
        };
      });
      return { rows: enriched as any, rowCount: enriched.length };
    }

    return { rows: records as any, rowCount: records.length };
  }

  private handleLocalInsert<T>(sql: string, params: any[]): QueryResult<T> {
    const lower = sql.toLowerCase();
    let tableName = '';
    const tableNames = ['users', 'refresh_tokens', 'instruments', 'market_candles', 'forecasts', 'forecast_evaluations', 'user_watchlists', 'price_alerts'];
    
    for (const t of tableNames) {
      if (lower.includes(`into ${t}`)) {
        tableName = t;
        break;
      }
    }

    if (!tableName || !(tableName in this.localData)) {
      return { rows: [], rowCount: 0 };
    }

    let newRecord: any = {};
    if (tableName === 'users') {
      newRecord = {
        id: params[0] || crypto.randomUUID(),
        email: params[1],
        password_hash: params[2],
        display_name: params[3],
        role: params[4] || 'user',
        email_verified: params[5] ?? true,
        created_at: new Date().toISOString(),
        last_login_at: new Date().toISOString(),
      };
      this.localData.users.push(newRecord);
    } else if (tableName === 'refresh_tokens') {
      newRecord = {
        id: params[0] || crypto.randomUUID(),
        user_id: params[1],
        token_hash: params[2],
        issued_at: new Date().toISOString(),
        expires_at: params[3],
        revoked_at: null,
        replaced_by_token_id: null,
      };
      this.localData.refresh_tokens.push(newRecord);
    } else if (tableName === 'user_watchlists') {
      const exists = this.localData.user_watchlists.some(w => w.user_id === params[0] && w.instrument_id === params[1]);
      if (!exists) {
        newRecord = {
          user_id: params[0],
          instrument_id: params[1],
          added_at: new Date().toISOString(),
        };
        this.localData.user_watchlists.push(newRecord);
      }
    } else if (tableName === 'price_alerts') {
      newRecord = {
        id: params[0] || crypto.randomUUID(),
        user_id: params[1],
        instrument_id: params[2],
        condition_type: params[3],
        threshold: Number(params[4]),
        active: params[5] !== undefined ? Boolean(params[5]) : true,
        triggered_at: null,
        created_at: new Date().toISOString(),
      };
      this.localData.price_alerts.push(newRecord);
    } else if (tableName === 'market_candles') {
      newRecord = {
        id: params[0] || crypto.randomUUID(),
        instrument_id: params[1],
        candle_start: params[2],
        interval: params[3] || '1m',
        open: Number(params[4]),
        high: Number(params[5]),
        low: Number(params[6]),
        close: Number(params[7]),
        volume: Number(params[8]),
        source_mode: params[9],
        provider: params[10],
        received_at: new Date().toISOString(),
      };
      this.localData.market_candles.push(newRecord);
    } else if (tableName === 'forecasts') {
      newRecord = {
        id: params[0] || crypto.randomUUID(),
        instrument_id: params[1],
        issued_at: params[2],
        target_time: params[3],
        horizon_minutes: Number(params[4]),
        anchor_price: Number(params[5]),
        predicted_price: Number(params[6]),
        lower_bound: Number(params[7]),
        upper_bound: Number(params[8]),
        probability_up: Number(params[9]),
        model_version: params[10],
        source_mode: params[11],
        evaluation_status: 'PENDING',
      };
      this.localData.forecasts.push(newRecord);
    } else if (tableName === 'forecast_evaluations') {
      newRecord = {
        id: params[0] || crypto.randomUUID(),
        forecast_id: params[1],
        actual_price: Number(params[2]),
        absolute_error: Number(params[3]),
        directional_correctness: Boolean(params[4]),
        inside_interval: Boolean(params[5]),
        evaluation_timestamp: new Date().toISOString(),
      };
      this.localData.forecast_evaluations.push(newRecord);
    }

    this.saveLocalData();
    return { rows: [newRecord as T], rowCount: 1 };
  }

  private handleLocalUpdate<T>(sql: string, params: any[]): QueryResult<T> {
    const lower = sql.toLowerCase();
    if (lower.includes('update refresh_tokens') && lower.includes('revoked_at = current_timestamp')) {
      const tokenId = params[0];
      const token = this.localData.refresh_tokens.find(t => t.id === tokenId);
      if (token) {
        token.revoked_at = new Date().toISOString();
        if (params[1]) token.replaced_by_token_id = params[1];
        this.saveLocalData();
        return { rows: [token as any], rowCount: 1 };
      }
    } else if (lower.includes('update price_alerts') && lower.includes('active = $1')) {
      const active = Boolean(params[0]);
      const alertId = params[1];
      const userId = params[2];
      const alert = this.localData.price_alerts.find(a => a.id === alertId && a.user_id === userId);
      if (alert) {
        alert.active = active;
        this.saveLocalData();
        return { rows: [alert as any], rowCount: 1 };
      }
    } else if (lower.includes('update forecasts') && lower.includes('evaluation_status = $1')) {
      const status = params[0];
      const id = params[1];
      const f = this.localData.forecasts.find(item => item.id === id);
      if (f) {
        f.evaluation_status = status;
        this.saveLocalData();
        return { rows: [f as any], rowCount: 1 };
      }
    }
    return { rows: [], rowCount: 0 };
  }

  private handleLocalDelete<T>(sql: string, params: any[]): QueryResult<T> {
    const lower = sql.toLowerCase();
    if (lower.includes('from user_watchlists')) {
      const userId = params[0];
      const instrumentId = params[1];
      const before = this.localData.user_watchlists.length;
      this.localData.user_watchlists = this.localData.user_watchlists.filter(
        w => !(w.user_id === userId && w.instrument_id === instrumentId)
      );
      this.saveLocalData();
      return { rows: [], rowCount: before - this.localData.user_watchlists.length };
    } else if (lower.includes('from price_alerts')) {
      const alertId = params[0];
      const userId = params[1];
      const before = this.localData.price_alerts.length;
      this.localData.price_alerts = this.localData.price_alerts.filter(
        a => !(a.id === alertId && a.user_id === userId)
      );
      this.saveLocalData();
      return { rows: [], rowCount: before - this.localData.price_alerts.length };
    }
    return { rows: [], rowCount: 0 };
  }
}

export const db = new DatabaseService();
