import test from 'node:test';
import assert from 'node:assert/strict';
import { CandleAggregator } from '../src/modules/market/candleAggregator.js';
import { MarketTick } from '../src/modules/provider/types.js';

test('Market Ingestion: Tick Validation and 1-Minute Candle Aggregation', () => {
  const aggregator = new CandleAggregator();

  const baseTime = new Date('2026-10-18T10:00:05.000Z').getTime();

  // Tick 1 at 10:00:05
  const tick1: MarketTick = {
    exchange: 'NSE',
    symbol: 'RELIANCE',
    price: 3000.0,
    open: 3000.0,
    high: 3000.0,
    low: 3000.0,
    close: 3000.0,
    volume: 50,
    timestamp: new Date(baseTime).toISOString(),
    sourceMode: 'SIMULATED',
    provider: 'TestProvider',
    ingestTimestamp: Date.now() - 25,
  };

  const res1 = aggregator.processTick(tick1);
  assert.equal(res1.finalizedCandle, null, 'First tick in minute should not finalize candle');
  assert.equal(res1.quote.price, 3000.0);

  // Tick 2 at 10:00:30 (higher price, volume increment)
  const tick2: MarketTick = {
    ...tick1,
    price: 3010.0,
    volume: 100,
    timestamp: new Date(baseTime + 25000).toISOString(),
  };

  const res2 = aggregator.processTick(tick2);
  assert.equal(res2.quote.high, 3010.0);
  assert.equal(res2.quote.volume, 150);

  // Tick 3 at 10:01:02 (Minute boundary crossed! 10:00:00 candle must finalize)
  const tick3: MarketTick = {
    ...tick1,
    price: 3005.0,
    volume: 40,
    timestamp: new Date(baseTime + 62000).toISOString(),
  };

  const res3 = aggregator.processTick(tick3);
  assert.ok(res3.finalizedCandle, 'Crossing minute boundary must finalize completed 1-minute candle');
  assert.equal(res3.finalizedCandle?.open, 3000.0);
  assert.equal(res3.finalizedCandle?.high, 3010.0);
  assert.equal(res3.finalizedCandle?.close, 3010.0);
  assert.equal(res3.finalizedCandle?.volume, 150);
  assert.equal(res3.finalizedCandle?.sourceMode, 'SIMULATED');
});

test('Market Ingestion: Latency Budget SLA Verification (< 2000ms)', () => {
  const aggregator = new CandleAggregator();
  const now = Date.now();

  // Feed 50 ticks with simulated pipeline ingestion latencies
  for (let i = 0; i < 50; i++) {
    const delay = Math.floor(15 + Math.random() * 30); // 15ms - 45ms
    const tick: MarketTick = {
      exchange: 'NSE',
      symbol: 'TCS',
      price: 4100.0,
      open: 4100.0,
      high: 4100.0,
      low: 4100.0,
      close: 4100.0,
      volume: 20,
      timestamp: new Date().toISOString(),
      sourceMode: 'SIMULATED',
      provider: 'LatencyTester',
      ingestTimestamp: now - delay,
    };
    const res = aggregator.processTick(tick);
    assert.ok(res.latencyMs < 2000, `Latency (${res.latencyMs}ms) must be within 2000ms SLA budget`);
  }

  const stats = aggregator.getLatencyStats();
  assert.ok(stats.p50 < 2000, 'Median latency (p50) must be within SLA');
  assert.ok(stats.p95 < 2000, '95th percentile latency (p95) must be within SLA');
});

test('Market Ingestion: Invalid Tick Rejection', () => {
  const aggregator = new CandleAggregator();

  const badTick: MarketTick = {
    exchange: 'NSE',
    symbol: 'INFY',
    price: -50.0, // Invalid negative price
    open: 0,
    high: 0,
    low: 0,
    close: 0,
    volume: 0,
    timestamp: new Date().toISOString(),
    sourceMode: 'SIMULATED',
    provider: 'Test',
    ingestTimestamp: Date.now(),
  };

  const res = aggregator.processTick(badTick);
  assert.equal(res.quote, null, 'Invalid price tick must be rejected');
});
