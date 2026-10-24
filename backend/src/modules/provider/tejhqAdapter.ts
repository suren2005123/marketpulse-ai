import { EventEmitter } from 'events';
import crypto from 'crypto';
import { IMarketDataProvider, MarketTick, ProviderStatus, SourceMode } from './types.js';
import { config } from '../../config/index.js';
import { db } from '../../db/index.js';

export interface TejHQStatus {
  trading_date: string;
  stage: string;
  prices_published_at: string;
  derived_published_at: string | null;
  run_url: string | null;
  generated_at: string;
}

export interface TejHQSnapshotRow {
  symbol: string;
  series?: string;
  isin: string;
  name: string;
  open: number;
  high: number;
  low: number;
  close: number;
  last: number;
  prev_close: number;
  volume: number;
  turnover: number;
  trades: number;
}

export interface TejHQOHLCVRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  last: number;
  prev_close: number;
  volume: number;
  turnover: number;
  trades: number;
}

export interface TejHQDetailedStatus extends ProviderStatus {
  tradingDate: string | null;
  lastPublishedAt: string | null;
  lastPublishedIst: string | null;
  lastSyncAt: string | null;
  cachedSnapshotsCount: number;
  cachedOhlcvCount: number;
}

export function formatToIST(dateInput: string | Date | number): string {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d) + ' IST';
}

export class TejHQAdapter extends EventEmitter implements IMarketDataProvider {
  public name = 'tejhq-eod';
  private baseUrl: string;
  private isConnected = false;
  private lastReceivedAt: number | null = null;
  private lastExchangeTime: string | null = null;
  private consecutiveErrors = 0;
  private messageCount = 0;
  private latencySamples: number[] = [];
  private subscribedSymbols: Set<string> = new Set();

  // Freshness & sync metadata
  private latestTradingDate: string | null = null;
  private latestPricesPublishedAt: string | null = null;
  private lastSyncTimestamp: number | null = null;

  // Caching
  private statusCache: { data: TejHQStatus; expiresAt: number } | null = null;
  private snapshotCache: Map<string, { data: TejHQSnapshotRow[]; meta: any; expiresAt: number }> = new Map();
  private ohlcvCache: Map<string, { data: TejHQOHLCVRow[]; meta: any; expiresAt: number }> = new Map();

  // Periodic health check timer
  private statusPollTimer: NodeJS.Timeout | null = null;

  constructor(baseUrl?: string) {
    super();
    this.baseUrl = (baseUrl || process.env.TEJHQ_BASE_URL || 'https://api.tejhq.dev').replace(/\/+$/, '');
  }

  /**
   * Helper to execute fetch with AbortController timeout & rate-limit error handling
   */
  private async executeFetch<T>(endpoint: string, timeoutMs = 10000): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const start = Date.now();
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'MarketPulse-AI/2.0 (+https://marketpulse.ai)',
        },
      });

      const elapsed = Date.now() - start;
      this.recordLatency(elapsed);

      if (!response.ok) {
        if (response.status === 429) {
          this.consecutiveErrors++;
          throw new Error(`[TejHQ] Rate limit exceeded (HTTP 429) for ${endpoint}.`);
        }
        if (response.status === 404) {
          throw new Error(`[TejHQ] Resource not found (HTTP 404) for ${endpoint}.`);
        }
        const errText = await response.text().catch(() => '');
        this.consecutiveErrors++;
        throw new Error(`[TejHQ] HTTP ${response.status} ${response.statusText}: ${errText.slice(0, 200)}`);
      }

      const json = await response.json();
      this.consecutiveErrors = 0;
      this.lastReceivedAt = Date.now();
      return json as T;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        this.consecutiveErrors++;
        throw new Error(`[TejHQ] Request timed out after ${timeoutMs}ms for ${endpoint}`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;
    console.log(`[TejHQ] Connecting to TejHQ EOD service at ${this.baseUrl}...`);

    try {
      const status = await this.fetchStatus(true);
      this.isConnected = true;
      this.consecutiveErrors = 0;
      if (status) {
        this.latestTradingDate = status.trading_date;
        this.latestPricesPublishedAt = status.prices_published_at;
        this.lastExchangeTime = status.prices_published_at;
        console.log(`[TejHQ] Connected successfully. Latest trading date: ${status.trading_date} (published ${formatToIST(status.prices_published_at)})`);
      }
    } catch (err: any) {
      console.warn(`[TejHQ] Initial connection notice: ${err.message}. Provider will operate with available caches.`);
      this.isConnected = true; // Still allow provider to serve cached/persisted data
    }

    // Schedule 30-minute status refresh
    if (!this.statusPollTimer) {
      this.statusPollTimer = setInterval(() => {
        this.fetchStatus(true).catch(() => {});
      }, 30 * 60 * 1000);
    }

    this.emitStatus();
  }

  async disconnect(): Promise<void> {
    if (this.statusPollTimer) {
      clearInterval(this.statusPollTimer);
      this.statusPollTimer = null;
    }
    this.isConnected = false;
    this.emitStatus();
    console.log('[TejHQ] Disconnected from TejHQ provider.');
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

  /**
   * Fetch pipeline freshness and latest available trading date
   * Cache TTL: 5 minutes
   */
  async fetchStatus(forceRefresh = false): Promise<TejHQStatus | null> {
    const now = Date.now();
    if (!forceRefresh && this.statusCache && this.statusCache.expiresAt > now) {
      return this.statusCache.data;
    }

    try {
      const status = await this.executeFetch<TejHQStatus>('/v1/status');
      this.statusCache = {
        data: status,
        expiresAt: now + 5 * 60 * 1000,
      };
      this.latestTradingDate = status.trading_date;
      this.latestPricesPublishedAt = status.prices_published_at;
      this.lastExchangeTime = status.prices_published_at;
      this.emitStatus();
      return status;
    } catch (err: any) {
      console.error(`[TejHQ Status Error]: ${err.message}`);
      return this.statusCache?.data || null;
    }
  }

  /**
   * Fetch full-market bhavcopy snapshot for one exchange and date
   * Cache TTL: 60 minutes
   */
  async fetchSnapshot(exchange: 'NSE' | 'BSE' | string, date?: string): Promise<{ data: TejHQSnapshotRow[]; meta: any }> {
    const ex = exchange.toLowerCase();
    if (ex !== 'nse' && ex !== 'bse') {
      throw new Error(`[TejHQ] Invalid exchange: ${exchange}. Must be 'NSE' or 'BSE'.`);
    }

    let targetDate = date;
    if (!targetDate) {
      const status = await this.fetchStatus();
      targetDate = status?.trading_date || this.latestTradingDate || undefined;
    }

    const cacheKey = `${ex}:${targetDate || 'latest'}`;
    const now = Date.now();
    const cached = this.snapshotCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return { data: cached.data, meta: cached.meta };
    }

    const endpoint = targetDate ? `/v1/snapshot/${ex}?date=${targetDate}` : `/v1/snapshot/${ex}`;
    const result = await this.executeFetch<{ data: TejHQSnapshotRow[]; meta: any }>(endpoint, 15000);

    if (!result || !Array.isArray(result.data)) {
      throw new Error(`[TejHQ] Malformed snapshot response for ${exchange} on ${targetDate || 'latest'}.`);
    }

    // Cache valid response (60 min)
    this.snapshotCache.set(cacheKey, {
      data: result.data,
      meta: result.meta || { exchange: ex.toUpperCase(), date: targetDate, count: result.data.length },
      expiresAt: now + 60 * 60 * 1000,
    });

    this.messageCount += result.data.length;
    this.lastSyncTimestamp = now;
    return result;
  }

  /**
   * Fetch historical OHLCV rows for a given symbol and exchange
   * Cache TTL: 15 minutes
   */
  async fetchOHLCV(
    exchange: 'NSE' | 'BSE' | string,
    symbol: string,
    from?: string,
    to?: string
  ): Promise<{ data: TejHQOHLCVRow[]; meta: any }> {
    const ex = exchange.toLowerCase();
    const sym = symbol.toUpperCase().trim();
    const cacheKey = `${ex}:${sym}:${from || ''}:${to || ''}`;
    const now = Date.now();

    const cached = this.ohlcvCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return { data: cached.data, meta: cached.meta };
    }

    const queryParams = new URLSearchParams();
    if (from) queryParams.set('from', from);
    if (to) queryParams.set('to', to);
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';

    const endpoint = `/v1/ohlcv/${ex}/${encodeURIComponent(sym)}${queryString}`;
    const result = await this.executeFetch<{ data: TejHQOHLCVRow[]; meta: any }>(endpoint, 10000);

    if (!result || !Array.isArray(result.data)) {
      throw new Error(`[TejHQ] Malformed OHLCV response for ${exchange}:${sym}.`);
    }

    // Sort ascending by date
    const sorted = [...result.data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    this.ohlcvCache.set(cacheKey, {
      data: sorted,
      meta: result.meta || { exchange: ex.toUpperCase(), symbol: sym, count: sorted.length },
      expiresAt: now + 15 * 60 * 1000,
    });

    return { data: sorted, meta: result.meta };
  }

  /**
   * Synchronize single instrument quote from TejHQ snapshot
   */
  async getQuote(exchange: string, symbol: string): Promise<any | null> {
    const ex = exchange.toUpperCase();
    const sym = symbol.toUpperCase().trim();

    // 1. Check if snapshot is cached
    const snap = await this.fetchSnapshot(ex).catch(() => null);
    if (snap && snap.data) {
      const row = snap.data.find(r => r.symbol.toUpperCase() === sym);
      if (row) {
        const tradingDate = snap.meta?.date || this.latestTradingDate || new Date().toISOString().split('T')[0];
        const close = Number(row.close);
        const prevClose = Number(row.prev_close || close);
        const change = Number((close - prevClose).toFixed(2));
        const changePct = prevClose > 0 ? Number(((change / prevClose) * 100).toFixed(2)) : 0;
        const timestamp = new Date(`${tradingDate}T15:30:00+05:30`).toISOString();

        return {
          symbol: sym,
          exchange: ex,
          name: row.name,
          isin: row.isin,
          series: row.series || 'EQ',
          price: close,
          open: Number(row.open),
          high: Number(row.high),
          low: Number(row.low),
          close,
          prevClose,
          change,
          changePct,
          volume: Number(row.volume || 0),
          turnover: Number(row.turnover || 0),
          trades: Number(row.trades || 0),
          timestamp,
          tradingDate,
          lastUpdatedIst: formatToIST(timestamp),
          sourceMode: 'END_OF_DAY',
          provider: `TejHQ (${ex} Bhavcopy)`,
          freshness: 'END_OF_DAY',
        };
      }
    }

    // 2. If not found in snapshot, try fetching recent OHLCV
    const ohlcv = await this.fetchOHLCV(ex, sym).catch(() => null);
    if (ohlcv && ohlcv.data && ohlcv.data.length > 0) {
      const latest = ohlcv.data[ohlcv.data.length - 1];
      const prev = ohlcv.data[ohlcv.data.length - 2] || latest;
      const close = Number(latest.close);
      const prevClose = Number(latest.prev_close || prev.close);
      const change = Number((close - prevClose).toFixed(2));
      const changePct = prevClose > 0 ? Number(((change / prevClose) * 100).toFixed(2)) : 0;
      const timestamp = new Date(`${latest.date}T15:30:00+05:30`).toISOString();

      // Look up instrument name in database if available
      const inst = db.store.instruments.find(i => i.symbol === sym && i.exchange === ex);

      return {
        symbol: sym,
        exchange: ex,
        name: inst?.name || sym,
        price: close,
        open: Number(latest.open),
        high: Number(latest.high),
        low: Number(latest.low),
        close,
        prevClose,
        change,
        changePct,
        volume: Number(latest.volume || 0),
        turnover: Number(latest.turnover || 0),
        trades: Number(latest.trades || 0),
        timestamp,
        tradingDate: latest.date,
        lastUpdatedIst: formatToIST(timestamp),
        sourceMode: 'END_OF_DAY',
        provider: `TejHQ (${ex} OHLCV)`,
        freshness: 'END_OF_DAY',
      };
    }

    return null;
  }

  /**
   * Retrieve genuine daily OHLCV candles, synchronized with the latest quote
   */
  async getCandles(exchange: string, symbol: string, limit = 100): Promise<any[]> {
    const ex = exchange.toUpperCase();
    const sym = symbol.toUpperCase().trim();

    const ohlcv = await this.fetchOHLCV(ex, sym);
    if (!ohlcv || !ohlcv.data) return [];

    const candles = ohlcv.data.slice(-limit).map((c) => {
      const candleStart = new Date(`${c.date}T09:15:00+05:30`).toISOString();
      return {
        id: `tejhq-${ex.toLowerCase()}-${sym.toLowerCase()}-${c.date}`,
        timestamp: candleStart,
        date: c.date,
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume || 0),
        turnover: Number(c.turnover || 0),
        trades: Number(c.trades || 0),
        sourceMode: 'END_OF_DAY',
        provider: 'TejHQ',
      };
    });

    return candles;
  }

  /**
   * Persist genuine TejHQ historical candles into database with duplicate prevention
   */
  async syncCandlesToDatabase(exchange: string, symbol: string, instrumentId: string, limit = 100): Promise<number> {
    const candles = await this.getCandles(exchange, symbol, limit);
    let inserted = 0;

    for (const c of candles) {
      await db.upsertCandle({
        id: c.id,
        instrument_id: instrumentId,
        candle_start: c.timestamp,
        interval: '1d',
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        source_mode: 'END_OF_DAY',
        provider: 'TejHQ',
        received_at: new Date().toISOString(),
      });
      inserted++;
    }

    return inserted;
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
    const isStale = Boolean(this.lastReceivedAt && (now - this.lastReceivedAt > 3600000)); // 1 hour for EOD

    return {
      provider: 'TejHQ (NSE/BSE EOD Engine)',
      mode: 'END_OF_DAY',
      connected: this.isConnected,
      reconnecting: false,
      reconnectAttempts: 0,
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

  getDetailedStatus(): TejHQDetailedStatus {
    const base = this.getStatus();
    return {
      ...base,
      tradingDate: this.latestTradingDate,
      lastPublishedAt: this.latestPricesPublishedAt,
      lastPublishedIst: this.latestPricesPublishedAt ? formatToIST(this.latestPricesPublishedAt) : null,
      lastSyncAt: this.lastSyncTimestamp ? new Date(this.lastSyncTimestamp).toISOString() : null,
      cachedSnapshotsCount: this.snapshotCache.size,
      cachedOhlcvCount: this.ohlcvCache.size,
    };
  }

  private emitStatus(): void {
    this.emit('status', this.getStatus());
  }

  // Clear memory cache (useful for tests)
  clearCache(): void {
    this.statusCache = null;
    this.snapshotCache.clear();
    this.ohlcvCache.clear();
  }
}
