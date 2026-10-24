import { EventEmitter } from 'events';
import * as Upstox from 'upstox-js-sdk';
import { IMarketDataProvider, MarketTick, ProviderStatus, SourceMode } from './types.js';
import { config } from '../../config/index.js';
import { catalogueService } from '../market/catalogueService.js';
import { SEED_INSTRUMENTS } from '../../db/seed.js';

export type UpstoxAccountStatus = 
  | 'ACTIVE' 
  | 'ACCOUNT_UNDER_REVIEW' 
  | 'TOKEN_EXPIRED' 
  | 'DISCONNECTED' 
  | 'UNCONFIGURED';

export interface UpstoxDetailedStatus extends ProviderStatus {
  hasToken: boolean;
  accountStatus: UpstoxAccountStatus;
  actionableMessage: string;
  subscriptionCount: number;
  subscriptionLimit: number;
  activeSubscriptions: string[];
}

export class UpstoxV3Adapter extends EventEmitter implements IMarketDataProvider {
  public name = 'upstox-v3';
  private streamer: any = null;
  private isConnected = false;
  private isReconnecting = false;
  private reconnectAttempts = 0;
  private lastReceivedAt: number | null = null;
  private lastExchangeTime: string | null = null;
  private consecutiveErrors = 0;
  private messageCount = 0;
  private latencySamples: number[] = [];

  private accountStatus: UpstoxAccountStatus = 'UNCONFIGURED';
  private actionableMessage: string = 'Upstox credentials not configured. Configure credentials in Settings.';
  private accessToken: string | null = null;

  // Subscription Manager: Max 100 instruments per connection
  private readonly MAX_SUBSCRIPTIONS = 100;
  private prioritizedKeys: Set<string> = new Set(); // Watchlist & active stock
  private browsingKeys: Set<string> = new Set();    // Catalogue browsing (evictable)
  private keyToSymbolMap: Map<string, { symbol: string; exchange: string }> = new Map();

  constructor() {
    super();
    this.accessToken = config.provider.accessToken || null;
    this.initializeKeyMappings();
    this.updateInitialAccountStatus();
  }

  private initializeKeyMappings(): void {
    // Populate seed instrument keys
    for (const inst of SEED_INSTRUMENTS) {
      this.keyToSymbolMap.set(inst.providerKey, { symbol: inst.symbol, exchange: 'NSE' });
    }
  }

  private updateInitialAccountStatus(): void {
    if (!config.provider.clientId) {
      this.accountStatus = 'UNCONFIGURED';
      this.actionableMessage = 'Upstox Client ID is not configured. Set UPSTOX_CLIENT_ID in your environment or Settings.';
    } else if (!this.accessToken) {
      this.accountStatus = 'DISCONNECTED';
      this.actionableMessage = 'Upstox account is not authorized. Click "Connect Upstox" to authorize access.';
    } else {
      this.accountStatus = 'DISCONNECTED';
      this.actionableMessage = 'Upstox access token loaded. Ready to stream live data.';
    }
  }

  public setAccessToken(token: string, status: UpstoxAccountStatus = 'ACTIVE', message?: string): void {
    this.accessToken = token;
    config.provider.accessToken = token;
    Upstox.ApiClient.instance.authentications['OAUTH2'].accessToken = token;
    this.accountStatus = status;
    this.actionableMessage = message || (status === 'ACCOUNT_UNDER_REVIEW'
      ? 'Your Upstox account reactivation is currently under review by the broker. System is safely using TejHQ EOD data.'
      : 'Upstox authorization active.');
    this.emitStatus();
  }

  public setAccountStatus(status: UpstoxAccountStatus, message: string): void {
    this.accountStatus = status;
    this.actionableMessage = message;
    this.emitStatus();
  }

  public clearAccessToken(): void {
    this.accessToken = null;
    config.provider.accessToken = '';
    delete Upstox.ApiClient.instance.authentications['OAUTH2'].accessToken;
    this.accountStatus = 'DISCONNECTED';
    this.actionableMessage = 'Upstox disconnected by user.';
    if (this.streamer) {
      try {
        this.streamer.disconnect();
      } catch {}
      this.streamer = null;
    }
    this.isConnected = false;
    this.isReconnecting = false;
    this.emitStatus();
  }

  /**
   * Resolve an instrument key (e.g. NSE_EQ|INE002A01018) to symbol & exchange
   */
  public resolveKey(instrumentKey: string): { symbol: string; exchange: string } | null {
    if (this.keyToSymbolMap.has(instrumentKey)) {
      return this.keyToSymbolMap.get(instrumentKey)!;
    }

    // Check catalogue service
    const catalogueItem = catalogueService.getInstrumentByKey(instrumentKey);
    if (catalogueItem) {
      const resolved = { symbol: catalogueItem.symbol, exchange: catalogueItem.exchange };
      this.keyToSymbolMap.set(instrumentKey, resolved);
      return resolved;
    }

    // Fallback: parse segment from key
    const parts = instrumentKey.split('|');
    const segment = parts[0] || 'NSE_EQ';
    const exchange = segment.startsWith('BSE') ? 'BSE' : 'NSE';
    const isin = parts[1] || '';
    
    // Check if symbol exists in database by isin
    const inst = catalogueService.getAll().find(i => i.isin === isin || i.provider_instrument_key === instrumentKey);
    if (inst) {
      const resolved = { symbol: inst.symbol, exchange: inst.exchange };
      this.keyToSymbolMap.set(instrumentKey, resolved);
      return resolved;
    }

    return null;
  }

  /**
   * Resolve symbol to Upstox instrument key (e.g. RELIANCE -> NSE_EQ|INE002A01018)
   */
  public resolveSymbolToKey(symbol: string, exchange: string = 'NSE'): string | null {
    const cleanSym = symbol.toUpperCase().trim();
    // 1. Check seed instruments
    const seed = SEED_INSTRUMENTS.find(i => i.symbol === cleanSym);
    if (seed) return seed.providerKey;

    // 2. Check catalogue service
    const catItem = catalogueService.getInstrument(exchange, cleanSym) || 
      catalogueService.getInstrument('NSE', cleanSym) || 
      catalogueService.getInstrument('BSE', cleanSym);
    if (catItem && catItem.provider_instrument_key) {
      return catItem.provider_instrument_key;
    }

    return `${exchange}_EQ|${cleanSym}`;
  }

  /**
   * Get active subscription list
   */
  public getActiveSubscriptions(): string[] {
    return Array.from(new Set([...this.prioritizedKeys, ...this.browsingKeys]));
  }

  /**
   * Connect to Upstox V3 Market Data Feed
   */
  async connect(): Promise<void> {
    if (!this.accessToken) {
      console.warn('[Upstox V3] No access token available. Standing by in disconnected state.');
      this.isConnected = false;
      this.isReconnecting = false;
      this.emitStatus();
      return;
    }

    if (this.accountStatus === 'ACCOUNT_UNDER_REVIEW') {
      console.warn('[Upstox V3] Upstox account reactivation is currently under review. Refraining from live connection.');
      this.isConnected = false;
      this.isReconnecting = false;
      this.emitStatus();
      return;
    }

    try {
      this.isReconnecting = false;
      Upstox.ApiClient.instance.authentications['OAUTH2'].accessToken = this.accessToken;

      // Ensure seed default instruments are loaded into prioritizedKeys
      if (this.prioritizedKeys.size === 0) {
        for (const inst of SEED_INSTRUMENTS.slice(0, 10)) {
          this.prioritizedKeys.add(inst.providerKey);
        }
      }

      const initialKeys = this.getActiveSubscriptions().slice(0, this.MAX_SUBSCRIPTIONS);
      console.log(`[Upstox V3] Initializing MarketDataStreamerV3 with ${initialKeys.length} instruments...`);

      // Initialize official Upstox MarketDataStreamerV3
      this.streamer = new Upstox.MarketDataStreamerV3(initialKeys, 'full');
      this.streamer.autoReconnect(true, 2, 5);

      this.setupStreamerListeners();
      await this.streamer.connect();
    } catch (err: any) {
      console.error('[Upstox V3] Connection error:', err.message);
      this.consecutiveErrors++;
      this.isConnected = false;

      if (/under review|suspended|activation|not authorized|invalid_grant|401|403/i.test(err.message)) {
        this.accountStatus = 'ACCOUNT_UNDER_REVIEW';
        this.actionableMessage = 'Upstox account under review or authorization rejected. Retaining safe TejHQ EOD fallback.';
      }
      this.emitStatus();
    }
  }

  private setupStreamerListeners(): void {
    if (!this.streamer) return;

    this.streamer.on('open', () => {
      console.log('[Upstox V3] Connected to official Upstox Market Data Feed successfully.');
      this.isConnected = true;
      this.isReconnecting = false;
      this.reconnectAttempts = 0;
      this.consecutiveErrors = 0;
      this.accountStatus = 'ACTIVE';
      this.actionableMessage = 'Live market feed actively connected and streaming.';
      this.emitStatus();
      this.flushSubscriptions();
    });

    this.streamer.on('message', (data: any) => {
      this.handleFeedMessage(data);
    });

    this.streamer.on('error', (err: any) => {
      const errMsg = typeof err === 'string' ? err : err?.message || 'WebSocket feed error';
      console.error('[Upstox V3] Streamer error:', errMsg);
      this.consecutiveErrors++;

      if (/under review|deactivated|suspended|permission|401|403|unauthorized|invalid|response: 401/i.test(errMsg)) {
        if (this.streamer && typeof this.streamer.autoReconnect === 'function') {
          this.streamer.autoReconnect(false);
        }
        this.isReconnecting = false;
        this.isConnected = false;

        if (/under review|suspended/i.test(errMsg)) {
          this.accountStatus = 'ACCOUNT_UNDER_REVIEW';
          this.actionableMessage = 'Upstox account is under review or lacks active market segments.';
        } else {
          this.accountStatus = 'TOKEN_EXPIRED';
          this.actionableMessage = 'Upstox access token is invalid or expired. Please re-authorize in Settings.';
        }
      } else if (this.consecutiveErrors >= 3 && this.streamer && typeof this.streamer.autoReconnect === 'function') {
        this.streamer.autoReconnect(false);
        this.isReconnecting = false;
        console.warn('[Upstox V3] Consecutive errors threshold reached. Stopped auto-reconnect to prevent retry loop.');
      }

      this.emitStatus();
    });

    this.streamer.on('close', () => {
      console.warn('[Upstox V3] Streamer connection closed.');
      this.isConnected = false;
      this.emitStatus();
    });

    this.streamer.on('reconnecting', (attemptMsg: string) => {
      console.log(`[Upstox V3] ${attemptMsg}`);
      this.isReconnecting = true;
      this.reconnectAttempts++;
      this.emitStatus();
    });

    this.streamer.on('autoReconnectStopped', (reason: string) => {
      console.warn(`[Upstox V3] Auto-reconnect stopped: ${reason}`);
      this.isReconnecting = false;
      this.emitStatus();
    });
  }

  /**
   * Parse genuine Upstox V3 message packets and normalize into MarketTick
   */
  public handleFeedMessage(data: any): void {
    try {
      const now = Date.now();
      this.lastReceivedAt = now;
      this.messageCount++;

      let payload: any = data;
      if (typeof data === 'string') {
        try {
          payload = JSON.parse(data);
        } catch {
          return;
        }
      } else if (Buffer.isBuffer(data)) {
        try {
          payload = JSON.parse(data.toString('utf8'));
        } catch {
          return;
        }
      }

      if (!payload || !payload.feeds) return;

      for (const [instrumentKey, feed] of Object.entries<any>(payload.feeds)) {
        if (!feed) continue;

        const resolved = this.resolveKey(instrumentKey);
        const symbol = resolved?.symbol || instrumentKey.split('|')[1] || instrumentKey;
        const exchange = resolved?.exchange || (instrumentKey.startsWith('BSE') ? 'BSE' : 'NSE');

        // Extract LTPC from marketFF, indexFF, or direct ltpc
        const ltpc = feed.ff?.marketFF?.ltpc || feed.ff?.indexFF?.ltpc || feed.ltpc;
        if (!ltpc || !ltpc.ltp) continue;

        const price = Number(ltpc.ltp);
        if (price <= 0 || isNaN(price)) continue;

        const lttMs = ltpc.ltt ? Number(ltpc.ltt) : now;
        const exchangeTime = new Date(lttMs).toISOString();
        this.lastExchangeTime = exchangeTime;

        // Measure live provider latency
        const latency = Math.max(5, now - lttMs);
        this.recordLatency(latency < 5000 ? latency : 50);

        // Extract OHLC if available in full feed
        const ohlc = feed.ff?.marketFF?.marketOHLC?.ohlc?.[0] || feed.ff?.indexFF?.marketOHLC?.ohlc?.[0];
        const open = Number(ohlc?.open || price);
        const high = Number(ohlc?.high || price);
        const low = Number(ohlc?.low || price);
        const close = price;
        const volume = Number(feed.ff?.marketFF?.vtt || feed.ff?.marketFF?.v || 0);

        const tick: MarketTick = {
          exchange,
          symbol,
          price,
          open,
          high,
          low,
          close,
          volume,
          timestamp: exchangeTime,
          sourceMode: 'LIVE',
          provider: 'Upstox-V3',
          ingestTimestamp: now,
        };

        this.emit('tick', tick);
      }

      this.emitStatus();
    } catch (err: any) {
      console.error('[Upstox V3] Error handling feed message:', err.message);
    }
  }

  /**
   * Subscribe to instruments with priority management and capacity limit enforcement (max 100)
   */
  public subscribe(symbolsOrKeys: string[], priority: 'HIGH' | 'NORMAL' = 'NORMAL'): void {
    const keysToAdd: string[] = [];

    for (const item of symbolsOrKeys) {
      if (!item) continue;
      // Determine if already an Upstox key (contains '|')
      const key = item.includes('|') ? item : this.resolveSymbolToKey(item);
      if (key) {
        keysToAdd.push(key);
      }
    }

    if (keysToAdd.length === 0) return;

    for (const key of keysToAdd) {
      if (priority === 'HIGH') {
        this.prioritizedKeys.add(key);
        this.browsingKeys.delete(key);
      } else {
        if (!this.prioritizedKeys.has(key)) {
          this.browsingKeys.add(key);
        }
      }
    }

    // Capacity enforcement: if total subscriptions exceed MAX_SUBSCRIPTIONS,
    // evict the oldest entries from browsingKeys (never evict prioritized watchlist keys)
    while (this.prioritizedKeys.size + this.browsingKeys.size > this.MAX_SUBSCRIPTIONS && this.browsingKeys.size > 0) {
      const oldestBrowsingKey = this.browsingKeys.values().next().value;
      if (oldestBrowsingKey) {
        this.browsingKeys.delete(oldestBrowsingKey);
        if (this.streamer && this.isConnected) {
          try {
            this.streamer.unsubscribe([oldestBrowsingKey]);
          } catch {}
        }
      } else {
        break;
      }
    }

    // Send subscriptions if connected
    if (this.streamer && this.isConnected) {
      try {
        this.streamer.subscribe(keysToAdd, 'full');
        console.log(`[Upstox V3] Dynamically subscribed to ${keysToAdd.length} instruments (Total: ${this.getActiveSubscriptions().length}/${this.MAX_SUBSCRIPTIONS})`);
      } catch (err: any) {
        console.error('[Upstox V3] Subscription error:', err.message);
      }
    }
  }

  /**
   * Unsubscribe from instruments
   */
  public unsubscribe(symbolsOrKeys: string[]): void {
    const keysToRemove: string[] = [];

    for (const item of symbolsOrKeys) {
      const key = item.includes('|') ? item : this.resolveSymbolToKey(item);
      if (key) {
        keysToRemove.push(key);
        this.prioritizedKeys.delete(key);
        this.browsingKeys.delete(key);
      }
    }

    if (keysToRemove.length > 0 && this.streamer && this.isConnected) {
      try {
        this.streamer.unsubscribe(keysToRemove);
      } catch (err: any) {
        console.error('[Upstox V3] Unsubscribe error:', err.message);
      }
    }
  }

  private flushSubscriptions(): void {
    if (!this.streamer || !this.isConnected) return;
    const allKeys = this.getActiveSubscriptions().slice(0, this.MAX_SUBSCRIPTIONS);
    if (allKeys.length > 0) {
      try {
        this.streamer.subscribe(allKeys, 'full');
        console.log(`[Upstox V3] Flushed ${allKeys.length} active subscriptions to streamer.`);
      } catch (err: any) {
        console.error('[Upstox V3] Error flushing subscriptions:', err.message);
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.streamer) {
      try {
        if (typeof this.streamer.autoReconnect === 'function') {
          this.streamer.autoReconnect(false);
        }
        this.streamer.disconnect();
      } catch {}
      this.streamer = null;
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

  public getStatus(): ProviderStatus {
    const now = Date.now();
    const isStale = Boolean(this.lastReceivedAt && (now - this.lastReceivedAt > 15000));

    return {
      provider: 'Upstox-V3',
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

  public getDetailedStatus(): UpstoxDetailedStatus {
    const base = this.getStatus();
    const activeSubs = this.getActiveSubscriptions();

    return {
      ...base,
      hasToken: Boolean(this.accessToken),
      accountStatus: this.accountStatus,
      actionableMessage: this.actionableMessage,
      subscriptionCount: activeSubs.length,
      subscriptionLimit: this.MAX_SUBSCRIPTIONS,
      activeSubscriptions: activeSubs,
    };
  }

  private emitStatus(): void {
    this.emit('status', this.getStatus());
  }

  // Unit-test helper to inject mock streamer without making network calls
  public injectMockStreamer(mockStreamer: any): void {
    this.streamer = mockStreamer;
    this.setupStreamerListeners();
  }
}
