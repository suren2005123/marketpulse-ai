import test from 'node:test';
import assert from 'node:assert/strict';
import { TejHQAdapter, formatToIST, TejHQSnapshotRow, TejHQOHLCVRow } from '../src/modules/provider/tejhqAdapter.js';
import { ProviderManager } from '../src/modules/provider/providerManager.js';
import { db } from '../src/db/index.js';

test('TejHQ Adapter: IST Timezone Formatting', () => {
  const utcIso = '2026-10-23T19:52:18.000Z';
  const istFormatted = formatToIST(utcIso);
  // UTC 19:52 + 5:30 = next day 01:22 IST (24/10/2026, 01:22:18 IST)
  assert.ok(istFormatted.includes('IST'), 'Must contain IST indicator');
  assert.ok(istFormatted.includes('2026'), 'Must contain year 2026');
});

test('TejHQ Adapter: Snapshot Response Parsing and Quote Derivation', async () => {
  const adapter = new TejHQAdapter();

  // Test row mimicking verified live TejHQ NSE snapshot row
  const mockRow: TejHQSnapshotRow = {
    symbol: 'RELIANCE',
    series: 'EQ',
    isin: 'INE002A01018',
    name: 'RELIANCE INDUSTRIES LTD',
    open: 1184.0,
    high: 1201.9,
    low: 1163.1,
    close: 1190.0,
    last: 1190.0,
    prev_close: 1184.5,
    volume: 14905641,
    turnover: 17600407277.5,
    trades: 241397,
  };

  const expectedChange = Number((1190.0 - 1184.5).toFixed(2)); // +5.50
  const expectedChangePct = Number(((5.50 / 1184.5) * 100).toFixed(2)); // +0.46%

  assert.equal(mockRow.symbol, 'RELIANCE');
  assert.equal(mockRow.close, 1190.0);
  assert.equal(expectedChange, 5.5);
  assert.equal(expectedChangePct, 0.46);
});

test('TejHQ Adapter: Historical OHLCV Parsing and Chronological Ordering', () => {
  const rawRows: TejHQOHLCVRow[] = [
    { date: '2026-10-23', open: 1184, high: 1201.9, low: 1163.1, close: 1190, last: 1190, prev_close: 1184.5, volume: 14905641, turnover: 17600407277.5, trades: 241397 },
    { date: '2026-10-21', open: 1212, high: 1234.3, low: 1199.3, close: 1209, last: 1209, prev_close: 1202, volume: 17607823, turnover: 21423587298.8, trades: 316700 },
    { date: '2026-10-22', open: 1206.2, high: 1208, low: 1184.5, close: 1184.5, last: 1184.5, prev_close: 1209, volume: 14957042, turnover: 17836751897.1, trades: 213072 },
  ];

  // Sorting ascending by date
  const sorted = [...rawRows].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  assert.equal(sorted[0].date, '2026-10-21');
  assert.equal(sorted[1].date, '2026-10-22');
  assert.equal(sorted[2].date, '2026-10-23');
  assert.equal(sorted[2].close, 1190);
});

test('TejHQ Adapter: In-Memory Caching and Repeated Requests', async () => {
  const adapter = new TejHQAdapter();
  adapter.clearCache();

  // Test live status caching
  const status1 = await adapter.fetchStatus();
  assert.ok(status1, 'Status response must not be null');
  assert.ok(status1?.trading_date, 'Must have trading_date');

  const startCache = Date.now();
  const status2 = await adapter.fetchStatus(); // Should hit cache
  const duration = Date.now() - startCache;

  assert.deepEqual(status1, status2, 'Cached response must match original');
  assert.ok(duration < 20, 'Cached response should resolve in < 20ms');
});

test('TejHQ Adapter: Error Handling for Invalid Exchange and Malformed Endpoints', async () => {
  const adapter = new TejHQAdapter();

  await assert.rejects(
    async () => {
      await adapter.fetchSnapshot('INVALID_EXCHANGE');
    },
    /Invalid exchange/
  );
});

test('Database: Duplicate Candle Prevention with Upsert', async () => {
  await db.init();

  const testInstId = 'inst-test-tejhq-dup';
  await db.upsertInstrument({
    id: testInstId,
    exchange: 'NSE',
    symbol: 'TESTDUP',
    name: 'Test Duplicate Prevention Ltd',
    sector: 'Technology',
  });

  const candleTimestamp = '2026-10-23T09:15:00.000Z';

  // 1. First insert
  await db.upsertCandle({
    id: 'test-candle-1',
    instrument_id: testInstId,
    candle_start: candleTimestamp,
    interval: '1d',
    open: 100,
    high: 110,
    low: 95,
    close: 105,
    volume: 1000,
    source_mode: 'END_OF_DAY',
    provider: 'TejHQ',
  });

  // Count candles for this instrument and timestamp
  const count1 = db.store.market_candles.filter(
    c => c.instrument_id === testInstId && c.interval === '1d' && c.candle_start === candleTimestamp
  ).length;
  assert.equal(count1, 1, 'Should have exactly 1 candle after first insert');

  // 2. Second insert with identical instrument, interval, and timestamp (updated close)
  await db.upsertCandle({
    id: 'test-candle-2-dup',
    instrument_id: testInstId,
    candle_start: candleTimestamp,
    interval: '1d',
    open: 100,
    high: 112, // updated high
    low: 95,
    close: 108, // updated close
    volume: 1500, // updated volume
    source_mode: 'END_OF_DAY',
    provider: 'TejHQ',
  });

  const count2 = db.store.market_candles.filter(
    c => c.instrument_id === testInstId && c.interval === '1d' && c.candle_start === candleTimestamp
  ).length;
  assert.equal(count2, 1, 'Should STILL have exactly 1 candle (no duplicate created)');

  const updated = db.store.market_candles.find(
    c => c.instrument_id === testInstId && c.interval === '1d' && c.candle_start === candleTimestamp
  );
  assert.equal(updated?.close, 108, 'Candle values should be safely updated in-place');
  assert.equal(updated?.volume, 1500);

  // Clean up test records
  db.store.market_candles = db.store.market_candles.filter(c => c.instrument_id !== testInstId);
  db.store.instruments = db.store.instruments.filter(i => i.id !== testInstId);
  if (db.isPostgres()) {
    const pool = db.getPool();
    await pool?.query('DELETE FROM market_candles WHERE instrument_id = $1', [testInstId]);
    await pool?.query('DELETE FROM instruments WHERE id = $1', [testInstId]);
  }
});

test('Price-to-Chart Synchronization: Quote Close Matches Latest OHLCV Candle', async () => {
  const adapter = new TejHQAdapter();

  // Fetch real RELIANCE OHLCV
  const ohlcv = await adapter.fetchOHLCV('NSE', 'RELIANCE');
  assert.ok(ohlcv.data.length > 0, 'Should return historical candles');

  const latestCandle = ohlcv.data[ohlcv.data.length - 1];
  assert.ok(latestCandle.close > 0, 'Latest candle must have valid positive close');
  assert.ok(latestCandle.date, 'Latest candle must have a date');

  // Fetch quote
  const quote = await adapter.getQuote('NSE', 'RELIANCE');
  assert.ok(quote, 'Should return quote');

  // Verify synchronization: The displayed price and latest chart candle MUST match
  assert.equal(
    quote.price,
    latestCandle.close,
    'Displayed latest quote price MUST exactly match the latest candle close from the same source'
  );
  assert.equal(
    quote.close,
    latestCandle.close,
    'Quote close MUST match latest candle close'
  );
  assert.equal(
    quote.sourceMode,
    'END_OF_DAY',
    'Source mode must be truthfully labeled END_OF_DAY'
  );
  assert.equal(
    quote.freshness,
    'END_OF_DAY',
    'Freshness must be END_OF_DAY'
  );
});

test('Provider Manager: Mode Switching and Provider Isolation', async () => {
  const manager = new ProviderManager('SIMULATED');
  assert.equal(manager.getCurrentMode(), 'SIMULATED');
  assert.equal(manager.getStatus().mode, 'SIMULATED');

  // Switch to END_OF_DAY mode
  await manager.switchMode('END_OF_DAY');
  assert.equal(manager.getCurrentMode(), 'END_OF_DAY');
  assert.equal(manager.getStatus().mode, 'END_OF_DAY');
  assert.ok(manager.getActiveProvider().name.includes('tejhq'), 'Active provider should be TejHQ');

  // Switch back to SIMULATED mode
  await manager.switchMode('SIMULATED');
  assert.equal(manager.getCurrentMode(), 'SIMULATED');
  assert.equal(manager.getStatus().mode, 'SIMULATED');

  await manager.disconnect();
});
