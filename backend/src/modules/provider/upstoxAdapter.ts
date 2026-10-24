import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { IMarketDataProvider, MarketTick, ProviderStatus } from './types.js';
import { config } from '../../config/index.js';
import { SEED_INSTRUMENTS } from '../../db/seed.js';

export class UpstoxV3Adapter extends EventEmitter implements IMarketDataProvider {
  public name = 'upstox-v3';
  private ws: WebSocket | null = null;
  private isConnected = false;
  private isReconnecting = false;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private subscribedSymbols: Set<string> = new Set();
  private lastReceivedAt: number | null = null;
  private lastExchangeTime: string | null = null;
  private consecutiveErrors = 0;
  private messageCount = 0;
  private latencySamples: number[] = [];

  // Symbol to Upstox Instrument Key mapping
  private symbolToKeyMap: Map<string, string> = new Map();
  private keyToSymbolMap: Map<string, string> = new Map();

  constructor() {
    super();
    for (const inst of SEED_INSTRUMENTS) {
      this.symbolToKeyMap.set(inst.symbol, inst.providerKey);
      this.keyToSymbolMap.set(inst.providerKey, inst.symbol);
    }
  }

  async connect(): Promise<void> {
    if (!config.provider.accessToken) {
      console.warn('[Upstox V3] No access token configured. Provider initialized in disconnected state. (Configure UPSTOX_ACCESS_TOKEN for live feed).');
      this.emitStatus();
      return;
    }

    try {
      this.isReconnecting = false;
      const wsUrl = `wss://api.upstox.com/v3/feed/market-data-feed`;
      
      this.ws = new WebSocket(wsUrl, {
        headers: {
          'Authorization': `Bearer ${config.provider.accessToken}`,
          'Accept': '*/*',
        },
      });

      this.ws.on('open', () => {
        console.log('[Upstox V3] WebSocket feed connected successfully.');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.consecutiveErrors = 0;
        this.emitStatus();
        this.sendSubscriptions();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (err) => {
        console.error('[Upstox V3] WebSocket error:', err.message);
        this.consecutiveErrors++;
        this.emitStatus();
      });

      this.ws.on('close', (code, reason) => {
        console.warn(`[Upstox V3] WebSocket closed (${code}: ${reason.toString()}).`);
        this.isConnected = false;
        this.emitStatus();
        this.scheduleReconnect();
      });

      this.ws.on('ping', () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.pong();
        }
      });
    } catch (err: any) {
      console.error('[Upstox V3] Connection exception:', err.message);
      this.consecutiveErrors++;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.isReconnecting = true;
    this.reconnectAttempts++;
    
    // Exponential backoff: 1s, 2s, 4s, 8s, up to 30s
    const backoffMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
    console.log(`[Upstox V3] Scheduling reconnect attempt #${this.reconnectAttempts} in ${backoffMs}ms...`);
    this.emitStatus();

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, backoffMs);
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const now = Date.now();
      this.lastReceivedAt = now;
      this.messageCount++;

      // Upstox V3 sends binary (protobuf) or JSON depending on configuration
      let payload: any;
      if (typeof data === 'string') {
        payload = JSON.parse(data);
      } else if (Buffer.isBuffer(data)) {
        try {
          payload = JSON.parse(data.toString('utf8'));
        } catch {
          // If binary protobuf, can be parsed with protobuf schema
          return;
        }
      }

      if (!payload || !payload.feeds) return;

      for (const [instrumentKey, feed] of Object.entries<any>(payload.feeds)) {
        const symbol = this.keyToSymbolMap.get(instrumentKey);
        if (!symbol) continue;

        const ltpc = feed.ff?.marketFF?.ltpc || feed.ltpc;
        if (!ltpc) continue;

        const exchangeTime = ltpc.ltt ? new Date(Number(ltpc.ltt)).toISOString() : new Date().toISOString();
        this.lastExchangeTime = exchangeTime;

        const latency = now - (ltpc.ltt ? Number(ltpc.ltt) : now);
        this.recordLatency(latency > 0 ? latency : 50);

        const tick: MarketTick = {
          exchange: 'NSE',
          symbol,
          price: Number(ltpc.ltp),
          open: Number(feed.ff?.marketFF?.marketOHLC?.ohlc?.[0]?.open || ltpc.ltp),
          high: Number(feed.ff?.marketFF?.marketOHLC?.ohlc?.[0]?.high || ltpc.ltp),
          low: Number(feed.ff?.marketFF?.marketOHLC?.ohlc?.[0]?.low || ltpc.ltp),
          close: Number(ltpc.ltp),
          volume: Number(feed.ff?.marketFF?.v || 0),
          timestamp: exchangeTime,
          sourceMode: 'LIVE',
          provider: 'Upstox-V3',
          ingestTimestamp: now,
        };

        this.emit('tick', tick);
      }
      this.emitStatus();
    } catch (err: any) {
      console.error('[Upstox V3] Error parsing market feed packet:', err.message);
    }
  }

  private sendSubscriptions(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const keys: string[] = [];
    for (const sym of this.subscribedSymbols) {
      const key = this.symbolToKeyMap.get(sym);
      if (key) keys.push(key);
    }

    if (keys.length === 0) return;

    const subMessage = {
      guid: 'marketpulse-sub',
      method: 'sub',
      data: {
        mode: 'full',
        instrumentKeys: keys,
      },
    };

    this.ws.send(JSON.stringify(subMessage));
    console.log(`[Upstox V3] Sent subscription request for ${keys.length} instruments.`);
  }

  subscribe(symbols: string[]): void {
    for (const s of symbols) {
      this.subscribedSymbols.add(s.toUpperCase());
    }
    this.sendSubscriptions();
  }

  unsubscribe(symbols: string[]): void {
    for (const s of symbols) {
      this.subscribedSymbols.delete(s.toUpperCase());
    }
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.isReconnecting = false;
    this.emitStatus();
  }

  private recordLatency(ms: number): void {
    this.latencySamples.push(ms);
    if (this.latencySamples.length > 200) {
      this.latencySamples.shift();
    }
  }

  private getPercentile(pct: number): number {
    if (this.latencySamples.length === 0) return 0;
    const sorted = [...this.latencySamples].sort((a, b) => a - b);
    const idx = Math.floor((pct / 100) * sorted.length);
    return sorted[Math.min(idx, sorted.length - 1)];
  }

  getStatus(): ProviderStatus {
    const now = Date.now();
    const isStale = Boolean(this.lastReceivedAt && (now - this.lastReceivedAt > 15000));

    return {
      provider: 'Upstox V3',
      mode: 'LIVE',
      connected: this.isConnected,
      reconnecting: this.isReconnecting,
      reconnectAttempts: this.reconnectAttempts,
      lastReceivedTimestamp: this.lastReceivedAt ? new Date(this.lastReceivedAt).toISOString() : null,
      lastExchangeTimestamp: this.lastExchangeTime,
      consecutiveErrors: this.consecutiveErrors,
      messageCount: this.messageCount,
      stale: isStale,
      latencyMs: {
        p50: this.getPercentile(50),
        p95: this.getPercentile(95),
        current: this.latencySamples[this.latencySamples.length - 1] || 0,
      },
    };
  }

  private emitStatus(): void {
    this.emit('status', this.getStatus());
  }
}
