import { EventEmitter } from 'events';
import { IMarketDataProvider, MarketTick, ProviderStatus } from './types.js';
import { db } from '../../db/index.js';
import { SEED_INSTRUMENTS } from '../../db/seed.js';

export class HistoricalReplayAdapter extends EventEmitter implements IMarketDataProvider {
  public name = 'historical-replay';
  private timer: NodeJS.Timeout | null = null;
  private isConnected = false;
  private playbackSpeedMultiplier = 5;
  private currentIndex = 0;
  private candles: any[] = [];
  private lastReceivedAt: number | null = null;
  private lastExchangeTime: string | null = null;
  private messageCount = 0;

  constructor() {
    super();
  }

  setSpeed(multiplier: number): void {
    this.playbackSpeedMultiplier = Math.max(1, Math.min(multiplier, 60));
    if (this.isConnected) {
      this.restartLoop();
    }
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;
    this.candles = [...db.store.market_candles].sort((a, b) => 
      new Date(a.candle_start).getTime() - new Date(b.candle_start).getTime()
    );

    if (this.candles.length === 0) {
      console.warn('[Replay] No historical candles available to replay.');
      return;
    }

    this.isConnected = true;
    this.currentIndex = 0;
    console.log(`[Replay] Started historical replay of ${this.candles.length} candles at ${this.playbackSpeedMultiplier}x speed.`);
    this.restartLoop();
    this.emitStatus();
  }

  private restartLoop(): void {
    if (this.timer) clearInterval(this.timer);
    // In 1m replay: 60s / multiplier -> e.g. 5x speed = 12000ms per candle or simulated sub-interval
    const intervalMs = Math.max(500, Math.floor(2000 / this.playbackSpeedMultiplier));

    this.timer = setInterval(() => {
      this.step();
    }, intervalMs);
  }

  private step(): void {
    if (this.candles.length === 0) return;
    if (this.currentIndex >= this.candles.length) {
      this.currentIndex = 0; // loop replay
    }

    const candle = this.candles[this.currentIndex];
    this.currentIndex++;

    const inst = SEED_INSTRUMENTS.find(i => i.id === candle.instrument_id);
    const now = Date.now();
    this.lastReceivedAt = now;
    this.lastExchangeTime = candle.candle_start;
    this.messageCount++;

    const tick: MarketTick = {
      exchange: inst?.exchange || 'NSE',
      symbol: inst?.symbol || 'RELIANCE',
      price: candle.close,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      timestamp: candle.candle_start,
      sourceMode: 'HISTORICAL_REPLAY',
      provider: 'MarketPulse-Replay',
      ingestTimestamp: now - 15,
    };

    this.emit('tick', tick);
  }

  subscribe(symbols: string[]): void {}
  unsubscribe(symbols: string[]): void {}

  async disconnect(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isConnected = false;
    this.emitStatus();
  }

  getStatus(): ProviderStatus {
    return {
      provider: `Historical Replay Engine (${this.playbackSpeedMultiplier}x speed)`,
      mode: 'HISTORICAL_REPLAY',
      connected: this.isConnected,
      reconnecting: false,
      reconnectAttempts: 0,
      lastReceivedTimestamp: this.lastReceivedAt ? new Date(this.lastReceivedAt).toISOString() : null,
      lastExchangeTimestamp: this.lastExchangeTime,
      consecutiveErrors: 0,
      messageCount: this.messageCount,
      stale: false,
      latencyMs: {
        p50: 15,
        p95: 25,
        current: 15,
      },
    };
  }

  private emitStatus(): void {
    this.emit('status', this.getStatus());
  }
}
