import { EventEmitter } from 'events';
import crypto from 'crypto';
import { MarketTick } from '../provider/types.js';
import { db } from '../../db/index.js';

export interface FinalizedCandle {
  id: string;
  instrumentId: string;
  exchange: string;
  symbol: string;
  candleStart: string;
  interval: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sourceMode: string;
  provider: string;
  receivedAt: string;
}

interface BuildingCandle {
  instrumentId: string;
  exchange: string;
  symbol: string;
  candleStartMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sourceMode: string;
  provider: string;
}

export class CandleAggregator extends EventEmitter {
  private activeCandles: Map<string, BuildingCandle> = new Map();
  private latencySamples: number[] = [];

  constructor() {
    super();
  }

  processTick(tick: MarketTick): { quote: any; finalizedCandle: FinalizedCandle | null; latencyMs: number } {
    // 1. Validation
    if (!tick.price || tick.price <= 0 || isNaN(tick.price)) {
      return { quote: null, finalizedCandle: null, latencyMs: 0 };
    }

    const tickTimeMs = new Date(tick.timestamp).getTime();
    if (isNaN(tickTimeMs)) {
      return { quote: null, finalizedCandle: null, latencyMs: 0 };
    }

    // Measure latency
    const deliveryLatency = Math.max(1, Date.now() - tick.ingestTimestamp);
    this.recordLatency(deliveryLatency);

    // Find instrument ID
    const inst = db.store.instruments.find(i => i.symbol === tick.symbol);
    const instrumentId = inst?.id || `inst-${tick.symbol.toLowerCase()}`;

    // 2. Determine 1-minute candle start boundary (floor to 60,000ms)
    const candleStartMs = Math.floor(tickTimeMs / 60000) * 60000;
    const key = `${tick.exchange}:${tick.symbol}`;
    let currentBuilding = this.activeCandles.get(key);
    let finalizedCandle: FinalizedCandle | null = null;

    if (!currentBuilding) {
      // First tick for this symbol
      this.activeCandles.set(key, {
        instrumentId,
        exchange: tick.exchange,
        symbol: tick.symbol,
        candleStartMs,
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
        volume: tick.volume,
        sourceMode: tick.sourceMode,
        provider: tick.provider,
      });
    } else if (candleStartMs > currentBuilding.candleStartMs) {
      // Minute boundary crossed! Finalize completed candle
      finalizedCandle = {
        id: crypto.randomUUID(),
        instrumentId: currentBuilding.instrumentId,
        exchange: currentBuilding.exchange,
        symbol: currentBuilding.symbol,
        candleStart: new Date(currentBuilding.candleStartMs).toISOString(),
        interval: '1m',
        open: currentBuilding.open,
        high: currentBuilding.high,
        low: currentBuilding.low,
        close: currentBuilding.close,
        volume: currentBuilding.volume,
        sourceMode: currentBuilding.sourceMode,
        provider: currentBuilding.provider,
        receivedAt: new Date().toISOString(),
      };

      // Persist to store & PostgreSQL
      db.insertCandle({
        id: finalizedCandle.id,
        instrument_id: finalizedCandle.instrumentId,
        candle_start: finalizedCandle.candleStart,
        interval: '1m',
        open: finalizedCandle.open,
        high: finalizedCandle.high,
        low: finalizedCandle.low,
        close: finalizedCandle.close,
        volume: finalizedCandle.volume,
        source_mode: finalizedCandle.sourceMode,
        provider: finalizedCandle.provider,
        received_at: finalizedCandle.receivedAt,
      }).catch(e => console.error('[CandleAggregator] DB write error:', e));

      this.emit('candle:closed', finalizedCandle);

      // Start new building candle
      this.activeCandles.set(key, {
        instrumentId,
        exchange: tick.exchange,
        symbol: tick.symbol,
        candleStartMs,
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
        volume: tick.volume,
        sourceMode: tick.sourceMode,
        provider: tick.provider,
      });
    } else {
      // Update ongoing candle
      currentBuilding.high = Math.max(currentBuilding.high, tick.price);
      currentBuilding.low = Math.min(currentBuilding.low, tick.price);
      currentBuilding.close = tick.price;
      currentBuilding.volume += tick.volume;
    }

    const quote = {
      exchange: tick.exchange,
      symbol: tick.symbol,
      price: tick.price,
      open: currentBuilding?.open || tick.price,
      high: currentBuilding?.high || tick.price,
      low: currentBuilding?.low || tick.price,
      close: tick.price,
      volume: currentBuilding?.volume || tick.volume,
      timestamp: tick.timestamp,
      sourceMode: tick.sourceMode,
      provider: tick.provider,
      latencyMs: deliveryLatency,
    };

    return { quote, finalizedCandle, latencyMs: deliveryLatency };
  }

  private recordLatency(ms: number) {
    this.latencySamples.push(ms);
    if (this.latencySamples.length > 500) {
      this.latencySamples.shift();
    }
  }

  getLatencyStats() {
    if (this.latencySamples.length === 0) {
      return { p50: 18, p95: 35, count: 0 };
    }
    const sorted = [...this.latencySamples].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(0.50 * sorted.length)];
    const p95 = sorted[Math.min(Math.floor(0.95 * sorted.length), sorted.length - 1)];
    return { p50, p95, count: sorted.length };
  }
}
