import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from './index.js';

export const SEED_INSTRUMENTS = [
  { id: 'inst-rel', exchange: 'NSE', symbol: 'RELIANCE', name: 'Reliance Industries Ltd', sector: 'Energy & Retail', providerKey: 'NSE_EQ|INE002A01018', basePrice: 2985.50 },
  { id: 'inst-tcs', exchange: 'NSE', symbol: 'TCS', name: 'Tata Consultancy Services', sector: 'Information Technology', providerKey: 'NSE_EQ|INE467B01029', basePrice: 4140.00 },
  { id: 'inst-infy', exchange: 'NSE', symbol: 'INFY', name: 'Infosys Ltd', sector: 'Information Technology', providerKey: 'NSE_EQ|INE009A01021', basePrice: 1885.25 },
  { id: 'inst-hdfc', exchange: 'NSE', symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', sector: 'Banking & Financial Services', providerKey: 'NSE_EQ|INE040A01034', basePrice: 1682.40 },
  { id: 'inst-tmot', exchange: 'NSE', symbol: 'TATAMOTORS', name: 'Tata Motors Ltd', sector: 'Automobile', providerKey: 'NSE_EQ|INE155A01022', basePrice: 984.75 },
  { id: 'inst-icici', exchange: 'NSE', symbol: 'ICICIBANK', name: 'ICICI Bank Ltd', sector: 'Banking & Financial Services', providerKey: 'NSE_EQ|INE090A01021', basePrice: 1248.60 },
  { id: 'inst-sbin', exchange: 'NSE', symbol: 'SBIN', name: 'State Bank of India', sector: 'Public Sector Banking', providerKey: 'NSE_EQ|INE062A01020', basePrice: 822.30 },
  { id: 'inst-airtel', exchange: 'NSE', symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd', sector: 'Telecommunications', providerKey: 'NSE_EQ|INE397D01024', basePrice: 1650.00 },
  { id: 'inst-itc', exchange: 'NSE', symbol: 'ITC', name: 'ITC Ltd', sector: 'FMCG', providerKey: 'NSE_EQ|INE154A01025', basePrice: 485.50 },
  { id: 'inst-lici', exchange: 'BSE', symbol: 'LICI', name: 'Life Insurance Corp of India', sector: 'Insurance', providerKey: 'BSE_EQ|543526', basePrice: 1012.00 },
];

export async function seedDatabase() {
  await db.init();

  console.log('[Seed] Seeding initial database tables...');
  const pool = db.getPool();
  const isPg = db.isPostgres() && pool !== null;

  // 1. Seed Instruments
  for (const i of SEED_INSTRUMENTS) {
    if (isPg) {
      await pool!.query(
        `INSERT INTO instruments (id, exchange, symbol, name, sector, provider_instrument_key, active)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         ON CONFLICT (exchange, symbol) DO UPDATE SET active = true, name = EXCLUDED.name, sector = EXCLUDED.sector`,
        [i.id, i.exchange, i.symbol, i.name, i.sector, i.providerKey]
      );
    }
  }

  db.store.instruments = SEED_INSTRUMENTS.map(i => ({
    id: i.id,
    exchange: i.exchange,
    symbol: i.symbol,
    name: i.name,
    sector: i.sector,
    provider_instrument_key: i.providerKey,
    active: true,
  }));

  // 2. Seed Demo User
  const demoUserId = 'usr-demo-001';
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('DemoPassword123!', salt);

  if (isPg) {
    await pool!.query(
      `INSERT INTO users (id, email, password_hash, display_name, role, email_verified, created_at, last_login_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (email) DO NOTHING`,
      [
        demoUserId,
        'demo@marketpulse.ai',
        passwordHash,
        'Demo Trader',
        'admin',
        true,
        new Date().toISOString(),
        new Date().toISOString(),
      ]
    );
  }

  const existingDemoUser = db.store.users.find(u => u.email === 'demo@marketpulse.ai');
  if (!existingDemoUser) {
    db.store.users.push({
      id: demoUserId,
      email: 'demo@marketpulse.ai',
      password_hash: passwordHash,
      display_name: 'Demo Trader',
      role: 'admin',
      email_verified: true,
      created_at: new Date().toISOString(),
      last_login_at: new Date().toISOString(),
    });
  }

  // 2b. Seed User Preferences for Demo User
  await db.saveUserPreferences(demoUserId, {
    analysis_mode: 'BEGINNER',
    default_timeframe: '15m',
    favorite_indicators: ['RSI', 'MACD', 'EMA_20', 'EMA_50'],
    learning_level: 'BEGINNER',
  });

  // 3. Seed Watchlist for Demo User
  const watchlistItems = [
    { user_id: demoUserId, instrument_id: 'inst-rel', added_at: new Date().toISOString() },
    { user_id: demoUserId, instrument_id: 'inst-tcs', added_at: new Date().toISOString() },
    { user_id: demoUserId, instrument_id: 'inst-infy', added_at: new Date().toISOString() },
    { user_id: demoUserId, instrument_id: 'inst-hdfc', added_at: new Date().toISOString() },
    { user_id: demoUserId, instrument_id: 'inst-tmot', added_at: new Date().toISOString() },
  ];

  for (const w of watchlistItems) {
    if (isPg) {
      await pool!.query(
        'INSERT INTO user_watchlists (user_id, instrument_id, added_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [w.user_id, w.instrument_id, w.added_at]
      );
    }
  }
  db.store.user_watchlists = watchlistItems;

  // 4. Seed Price Alerts for Demo User
  const demoAlerts = [
    {
      id: 'alert-001',
      user_id: demoUserId,
      instrument_id: 'inst-rel',
      condition_type: 'PRICE_ABOVE',
      threshold: 3000.00,
      active: true,
      triggered_at: null,
      created_at: new Date().toISOString(),
    },
    {
      id: 'alert-002',
      user_id: demoUserId,
      instrument_id: 'inst-tmot',
      condition_type: 'PRICE_ABOVE',
      threshold: 1000.00,
      active: true,
      triggered_at: null,
      created_at: new Date().toISOString(),
    },
    {
      id: 'alert-003',
      user_id: demoUserId,
      instrument_id: 'inst-infy',
      condition_type: 'PCT_CHANGE_ABOVE',
      threshold: 1.5,
      active: true,
      triggered_at: null,
      created_at: new Date().toISOString(),
    }
  ];

  for (const a of demoAlerts) {
    if (isPg) {
      await pool!.query(
        `INSERT INTO price_alerts (id, user_id, instrument_id, condition_type, threshold, active, triggered_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [a.id, a.user_id, a.instrument_id, a.condition_type, a.threshold, a.active, a.triggered_at, a.created_at]
      );
    }
  }
  db.store.price_alerts = demoAlerts;

  // 5. Seed Historical Candles (60 candles for each stock)
  db.store.market_candles = [];
  const now = Date.now();
  for (const inst of SEED_INSTRUMENTS) {
    let currentPrice = inst.basePrice;
    for (let c = 60; c >= 0; c--) {
      const candleTime = new Date(now - c * 60 * 1000).toISOString();
      const pctChange = (Math.random() - 0.495) * 0.003;
      const open = currentPrice;
      const close = Number((open * (1 + pctChange)).toFixed(2));
      const high = Number((Math.max(open, close) + Math.random() * (open * 0.0015)).toFixed(2));
      const low = Number((Math.min(open, close) - Math.random() * (open * 0.0015)).toFixed(2));
      const volume = Math.floor(4000 + Math.random() * 8000);
      currentPrice = close;

      const candle = {
        id: crypto.randomUUID(),
        instrument_id: inst.id,
        candle_start: candleTime,
        interval: '1m',
        open,
        high,
        low,
        close,
        volume,
        source_mode: 'SIMULATED',
        provider: 'MarketPulse-Engine',
        received_at: candleTime,
      };

      if (isPg) {
        await pool!.query(
          `INSERT INTO market_candles (id, instrument_id, candle_start, interval, open, high, low, close, volume, source_mode, provider, received_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (id) DO NOTHING`,
          [
            candle.id,
            candle.instrument_id,
            candle.candle_start,
            candle.interval,
            candle.open,
            candle.high,
            candle.low,
            candle.close,
            candle.volume,
            candle.source_mode,
            candle.provider,
            candle.received_at,
          ]
        );
      }
      db.store.market_candles.push(candle);
    }
  }

  // 6. Seed Sample Evaluated Forecasts for Performance metrics
  db.store.forecasts = [];
  db.store.forecast_evaluations = [];

  for (const inst of SEED_INSTRUMENTS) {
    for (let h of [1, 5, 15]) {
      for (let i = 20; i >= 1; i--) {
        const issuedTime = new Date(now - (i + h) * 60 * 1000).toISOString();
        const targetTime = new Date(now - i * 60 * 1000).toISOString();
        const anchor = inst.basePrice * (1 + (Math.random() - 0.5) * 0.01);
        const drift = (Math.random() - 0.48) * 0.002 * Math.sqrt(h);
        const pred = Number((anchor * (1 + drift)).toFixed(2));
        const spread = anchor * 0.0035 * Math.sqrt(h);
        const lower = Number((pred - spread).toFixed(2));
        const upper = Number((pred + spread).toFixed(2));

        const forecastId = `fc-${inst.symbol}-${h}m-${i}`;
        const forecastRecord = {
          id: forecastId,
          instrument_id: inst.id,
          issued_at: issuedTime,
          target_time: targetTime,
          horizon_minutes: h,
          anchor_price: Number(anchor.toFixed(2)),
          predicted_price: pred,
          lower_bound: lower,
          upper_bound: upper,
          probability_up: drift > 0 ? 0.62 : 0.38,
          model_version: 'v2.1.0',
          source_mode: 'SIMULATED',
          evaluation_status: 'EVALUATED',
        };

        if (isPg) {
          await pool!.query(
            `INSERT INTO forecasts (id, instrument_id, issued_at, target_time, horizon_minutes, anchor_price, predicted_price, lower_bound, upper_bound, probability_up, model_version, source_mode, evaluation_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             ON CONFLICT (id) DO NOTHING`,
            [
              forecastRecord.id,
              forecastRecord.instrument_id,
              forecastRecord.issued_at,
              forecastRecord.target_time,
              forecastRecord.horizon_minutes,
              forecastRecord.anchor_price,
              forecastRecord.predicted_price,
              forecastRecord.lower_bound,
              forecastRecord.upper_bound,
              forecastRecord.probability_up,
              forecastRecord.model_version,
              forecastRecord.source_mode,
              forecastRecord.evaluation_status,
            ]
          );
        }
        db.store.forecasts.push(forecastRecord);

        const actual = Number((anchor * (1 + drift + (Math.random() - 0.5) * 0.0015)).toFixed(2));
        const absErr = Number(Math.abs(pred - actual).toFixed(2));
        const dirCorrect = (pred >= anchor && actual >= anchor) || (pred < anchor && actual < anchor);
        const inInterval = actual >= lower && actual <= upper;

        const evalRecord = {
          id: crypto.randomUUID(),
          forecast_id: forecastId,
          actual_price: actual,
          absolute_error: absErr,
          directional_correctness: dirCorrect,
          inside_interval: inInterval,
          evaluation_timestamp: targetTime,
        };

        if (isPg) {
          await pool!.query(
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
              evalRecord.evaluation_timestamp,
            ]
          );
        }
        db.store.forecast_evaluations.push(evalRecord);
      }
    }
  }

  if (isPg) {
    await db.syncFromPg();
  } else {
    db.saveLocalDataSync();
  }
  console.log('[Seed] Database successfully seeded with demo user, 10 instruments, candles, alerts, and performance history.');
}

// Execute if run directly
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seedDatabase().catch(err => {
    console.error('[Seed Error]:', err);
    process.exit(1);
  });
}
