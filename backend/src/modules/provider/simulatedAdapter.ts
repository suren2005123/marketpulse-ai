import { EventEmitter } from 'events';
import { IMarketDataProvider, MarketTick, ProviderStatus } from './types.js';
import { SEED_INSTRUMENTS } from '../../db/seed.js';

export class SimulatedAdapter extends EventEmitter implements IMarketDataProvider {
  public name = 'simulated-engine';
  private intervalTimer: NodeJS.Timeout | null = null;
  private isConnected = false;
  private subscribedSymbols: Set<string> = new Set();
  private prices: Map<string, number> = new Map();
  private lastReceivedAt: number | null = null;
  private messageCount = 0;
  private latencySamples: number[] = [];

  constructor() {
    super();
    for (const inst of SEED_INSTRUMENTS) {
      this.prices.set(inst.symbol, inst.basePrice);
    }
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;
    this.isConnected = true;
    console.log('[Simulated Feed] Deterministic tick generator started.');

    this.intervalTimer = setInterval(() => {
      this.generateTicks();
    }, 1000);

    this.emitStatus();
  }

  private generateTicks(): void {
    const now = Date.now();
    this.lastReceivedAt = now;

    // Simulate internal pipeline ingestion latency: 15-45ms
    const simulatedLatency = Math.floor(18 + Math.random() * 25);
    this.latencySamples.push(simulatedLatency);
    if (this.latencySamples.length > 200) this.latencySamples.shift();

    const symbolsToEmit = this.subscribedSymbols.size > 0 
      ? Array.from(this.subscribedSymbols) 
      : SEED_INSTRUMENTS.map(i => i.symbol);

    for (const symbol of symbolsToEmit) {
      const currentPrice = this.prices.get(symbol) || 1000.0;
      // Intraday shock with drift towards baseline
      const shock = (Math.random() - 0.498) * 0.0018;
      const nextPrice = Number((currentPrice * (1 + shock)).toFixed(2));
      this.prices.set(symbol, nextPrice);

      const inst = SEED_INSTRUMENTS.find(i => i.symbol === symbol);
      const spread = nextPrice * 0.0006;
      const high = Number((nextPrice + Math.random() * spread).toFixed(2));
      const low = Number((nextPrice - Math.random() * spread).toFixed(2));
      const volume = Math.floor(50 + Math.random() * 250);

      const tick: MarketTick = {
        exchange: inst?.exchange || 'NSE',
        symbol,
        price: nextPrice,
        open: currentPrice,
        high,
        low,
        close: nextPrice,
        volume,
        timestamp: new Date().toISOString(),
        sourceMode: 'SIMULATED',
        provider: 'MarketPulse-Simulated',
        ingestTimestamp: now - simulatedLatency,
      };

      this.messageCount++;
      this.emit('tick', tick);
    }
  }

  subscribe(symbols: string[]): void {
    for (const s of symbols) {
      this.subscribedSymbols.add(s.toUpperCase());
    }
  }

  unsubscribe(symbols: string[]): void {
    for (const s of symbols) {
      this.subscribedSymbols.delete(s.toUpperCase());
    }
  }

  async disconnect(): Promise<void> {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    this.isConnected = false;
    this.emitStatus();
  }

  private getPercentile(pct: number): number {
    if (this.latencySamples.length === 0) return 25;
    const sorted = [...this.latencySamples].sort((a, b) => a - b);
    const idx = Math.floor((pct / 100) * sorted.length);
    return sorted[Math.min(idx, sorted.length - 1)];
  }

  getStatus(): ProviderStatus {
    const now = Date.now();
    return {
      provider: 'Deterministic Simulator (GBM Engine)',
      mode: 'SIMULATED',
      connected: this.isConnected,
      reconnecting: false,
      reconnectAttempts: 0,
      lastReceivedTimestamp: this.lastReceivedAt ? new Date(this.lastReceivedAt).toISOString() : null,
      lastExchangeTimestamp: this.lastReceivedAt ? new Date(this.lastReceivedAt).toISOString() : null,
      consecutiveErrors: 0,
      messageCount: this.messageCount,
      stale: false,
      latencyMs: {
        p50: this.getPercentile(50),
        p95: this.getPercentile(95),
        current: this.latencySamples[this.latencySamples.length - 1] || 22,
      },
    };
  }

  private emitStatus(): void {
    this.emit('status', this.getStatus());
  }
}
