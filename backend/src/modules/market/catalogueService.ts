import zlib from 'zlib';
import crypto from 'crypto';
import { db } from '../../db/index.js';

export interface CatalogueInstrument {
  id: string;
  exchange: 'NSE' | 'BSE';
  symbol: string;
  name: string;
  sector: string;
  provider_instrument_key: string;
  isin: string;
  exchange_token?: string;
  active: boolean;
  price?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  prevClose?: number;
  change?: number;
  changePct?: number;
  volume?: number;
  turnover?: number;
  trades?: number;
  tradingDate?: string;
  lastUpdatedIst?: string;
  sourceMode?: string;
  freshness?: string;
}

export interface CatalogueQueryOptions {
  search?: string;
  exchange?: 'ALL' | 'NSE' | 'BSE' | string;
  sector?: string;
  sortBy?: 'symbol' | 'name' | 'exchange' | 'price' | 'changePct' | 'volume';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface CatalogueQueryResult {
  data: CatalogueInstrument[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    exchange: string;
    search: string;
    sortBy: string;
    sortOrder: string;
  };
  stats: {
    totalInstruments: number;
    nseCount: number;
    bseCount: number;
    lastRefreshedAt: string | null;
  };
}

class CatalogueService {
  private instruments: Map<string, CatalogueInstrument> = new Map();
  private instrumentsByKey: Map<string, CatalogueInstrument> = new Map();
  private lastRefreshedAt: string | null = null;
  private isRefreshing = false;

  private getCompositeKey(exchange: string, symbol: string): string {
    return `${exchange.toUpperCase()}:${symbol.toUpperCase().trim()}`;
  }

  private generateDeterministicId(exchange: string, symbol: string): string {
    return crypto.createHash('md5').update(`${exchange.toUpperCase()}:${symbol.toUpperCase()}`).digest('hex');
  }

  /**
   * Download and parse Upstox official compressed instrument master
   */
  async fetchUpstoxMaster(exchange: 'NSE' | 'BSE'): Promise<any[]> {
    const url = `https://assets.upstox.com/market-quote/instruments/exchange/${exchange}.json.gz`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'MarketPulse-AI/2.0',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} fetching ${exchange} master`);
      }

      const buffer = await response.arrayBuffer();
      const decompressed = zlib.gunzipSync(Buffer.from(buffer));
      return JSON.parse(decompressed.toString('utf8'));
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Filter and normalize raw Upstox records into eligible equity instruments
   */
  filterEquities(rawItems: any[], exchange: 'NSE' | 'BSE'): CatalogueInstrument[] {
    const results: CatalogueInstrument[] = [];
    const seenSymbols = new Set<string>();

    for (const item of rawItems) {
      if (!item || !item.trading_symbol || !item.isin) continue;
      const symbol = String(item.trading_symbol).toUpperCase().trim();
      if (!symbol || seenSymbols.has(symbol)) continue;

      let isEligible = false;
      if (exchange === 'NSE') {
        // Pure equities: NSE_EQ segment, EQ type, normal security
        isEligible = item.segment === 'NSE_EQ' &&
          (item.instrument_type === 'EQ' || item.security_type === 'NORMAL') &&
          !symbol.includes('-') && // exclude demerged / temporary series
          (item.isin.startsWith('INE') || item.isin.startsWith('INF'));
      } else {
        // BSE equities: BSE_EQ segment, Equity groups A, B, T, etc.
        const validTypes = ['A', 'B', 'EQ', 'T', 'X', 'XT', 'M', 'MT'];
        isEligible = item.segment === 'BSE_EQ' &&
          (validTypes.includes(item.instrument_type) || item.security_type === 'NORMAL') &&
          (item.isin.startsWith('INE') || item.isin.startsWith('INF'));
      }

      if (isEligible) {
        seenSymbols.add(symbol);
        const name = (item.short_name || item.name || symbol).slice(0, 150).trim();
        const id = this.generateDeterministicId(exchange, symbol);
        const instrumentKey = item.instrument_key || `${exchange}_EQ|${item.isin}`;

        results.push({
          id,
          exchange,
          symbol,
          name,
          sector: item.sector || (item.name?.toLowerCase().includes('bank') ? 'Banking' : 'Equities'),
          provider_instrument_key: instrumentKey,
          isin: item.isin,
          exchange_token: item.exchange_token ? String(item.exchange_token) : undefined,
          active: true,
        });
      }
    }

    return results;
  }

  /**
   * Populate or enrich prices from TejHQ snapshot if available
   */
  async enrichWithMarketData(instruments: CatalogueInstrument[]): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const [nseRes, bseRes] = await Promise.allSettled([
        fetch(`https://api.tejhq.dev/v1/snapshot/nse`).then(r => r.json()),
        fetch(`https://api.tejhq.dev/v1/snapshot/bse`).then(r => r.json()),
      ]);

      const priceMap = new Map<string, any>();

      const nseData = nseRes.status === 'fulfilled' && (nseRes.value as any)?.data;
      if (Array.isArray(nseData)) {
        for (const row of nseData) {
          if (row.symbol) priceMap.set(`NSE:${row.symbol.toUpperCase()}`, row);
        }
      }

      const bseData = bseRes.status === 'fulfilled' && (bseRes.value as any)?.data;
      if (Array.isArray(bseData)) {
        for (const row of bseData) {
          if (row.symbol) priceMap.set(`BSE:${row.symbol.toUpperCase()}`, row);
        }
      }

      for (const inst of instruments) {
        const row = priceMap.get(this.getCompositeKey(inst.exchange, inst.symbol));
        if (row) {
          const close = Number(row.close || 0);
          const prevClose = Number(row.prev_close || close);
          const change = Number((close - prevClose).toFixed(2));
          const changePct = prevClose > 0 ? Number(((change / prevClose) * 100).toFixed(2)) : 0;
          const tradingDate = row.date || today;

          inst.price = close;
          inst.open = Number(row.open || close);
          inst.high = Number(row.high || close);
          inst.low = Number(row.low || close);
          inst.close = close;
          inst.prevClose = prevClose;
          inst.change = change;
          inst.changePct = changePct;
          inst.volume = Number(row.volume || 0);
          inst.turnover = Number(row.turnover || 0);
          inst.trades = Number(row.trades || 0);
          inst.tradingDate = tradingDate;
          inst.sourceMode = 'END_OF_DAY';
          inst.freshness = 'END_OF_DAY';
        }
      }
    } catch (err: any) {
      console.warn('[Catalogue Service] Warning during market data price enrichment:', err.message);
    }
  }

  /**
   * Persist instruments into PostgreSQL in chunks of 500 rows
   */
  async persistToPostgres(instruments: CatalogueInstrument[]): Promise<void> {
    const pool = db.getPool();
    if (!pool || !db.isPostgres()) return;

    const chunkSize = 500;
    for (let i = 0; i < instruments.length; i += chunkSize) {
      const chunk = instruments.slice(i, i + chunkSize);
      const values: any[] = [];
      const valuePlaceholders: string[] = [];

      chunk.forEach((item, idx) => {
        const offset = idx * 7;
        valuePlaceholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`
        );
        values.push(
          item.id,
          item.exchange,
          item.symbol,
          item.name,
          item.sector,
          item.provider_instrument_key,
          item.active
        );
      });

      const query = `
        INSERT INTO instruments (id, exchange, symbol, name, sector, provider_instrument_key, active)
        VALUES ${valuePlaceholders.join(', ')}
        ON CONFLICT (exchange, symbol) DO UPDATE SET
          name = EXCLUDED.name,
          sector = EXCLUDED.sector,
          provider_instrument_key = EXCLUDED.provider_instrument_key,
          active = true
      `;

      try {
        await pool.query(query, values);
      } catch (err: any) {
        console.error(`[Catalogue Postgres Error] Chunk ${i / chunkSize}:`, err.message);
      }
    }
  }

  /**
   * Sync full catalogue from official Upstox masters with fallback and memory caching
   */
  async syncFullCatalogue(): Promise<{ total: number; nseCount: number; bseCount: number; durationMs: number }> {
    if (this.isRefreshing) {
      return {
        total: this.instruments.size,
        nseCount: this.getCountByExchange('NSE'),
        bseCount: this.getCountByExchange('BSE'),
        durationMs: 0,
      };
    }

    this.isRefreshing = true;
    const start = Date.now();
    console.log('[Catalogue Service] Starting official Upstox NSE & BSE master catalogue ingestion...');

    try {
      const [nseRawResult, bseRawResult] = await Promise.allSettled([
        this.fetchUpstoxMaster('NSE'),
        this.fetchUpstoxMaster('BSE'),
      ]);

      const nseEquities = nseRawResult.status === 'fulfilled' 
        ? this.filterEquities(nseRawResult.value, 'NSE')
        : [];
      
      const bseEquities = bseRawResult.status === 'fulfilled'
        ? this.filterEquities(bseRawResult.value, 'BSE')
        : [];

      if (nseRawResult.status === 'rejected') {
        console.warn('[Catalogue Service] Failed downloading Upstox NSE master:', nseRawResult.reason?.message);
      }
      if (bseRawResult.status === 'rejected') {
        console.warn('[Catalogue Service] Failed downloading Upstox BSE master:', bseRawResult.reason?.message);
      }

      const allCombined = [...nseEquities, ...bseEquities];

      if (allCombined.length > 0) {
        console.log(`[Catalogue Service] Parsed ${nseEquities.length} NSE & ${bseEquities.length} BSE equities (Total: ${allCombined.length}). Enriching prices...`);
        await this.enrichWithMarketData(allCombined);

        // Store into in-memory map
        for (const inst of allCombined) {
          this.instruments.set(this.getCompositeKey(inst.exchange, inst.symbol), inst);
          if (inst.provider_instrument_key) {
            this.instrumentsByKey.set(inst.provider_instrument_key, inst);
          }
        }

        // Persist to PostgreSQL in background
        await this.persistToPostgres(allCombined);

        // Sync to db.store
        db.store.instruments = Array.from(this.instruments.values()).map(inst => ({
          id: inst.id,
          exchange: inst.exchange,
          symbol: inst.symbol,
          name: inst.name,
          sector: inst.sector,
          provider_instrument_key: inst.provider_instrument_key,
          active: inst.active,
        }));
        db.saveLocalData();

        this.lastRefreshedAt = new Date().toISOString();
      } else {
        console.warn('[Catalogue Service] Upstox download produced 0 items. Retaining existing instruments.');
      }

      const durationMs = Date.now() - start;
      console.log(`[Catalogue Service] Catalogue sync completed in ${durationMs}ms. Total catalogue: ${this.instruments.size}`);

      return {
        total: this.instruments.size,
        nseCount: this.getCountByExchange('NSE'),
        bseCount: this.getCountByExchange('BSE'),
        durationMs,
      };
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Load instruments from local database cache on startup
   */
  async initializeFromDatabase(): Promise<void> {
    let existing = db.store.instruments;
    if (!existing || existing.length === 0) {
      try {
        const { SEED_INSTRUMENTS } = await import('../../db/seed.js');
        db.store.instruments = SEED_INSTRUMENTS.map(i => ({
          id: i.id,
          exchange: i.exchange,
          symbol: i.symbol,
          name: i.name,
          sector: i.sector,
          provider_instrument_key: i.providerKey,
          active: true,
        }));
        existing = db.store.instruments;
      } catch (err: any) {
        // Fallback gracefully
      }
    }
    if (existing && existing.length > 0) {
      for (const inst of existing) {
        const itemObj: CatalogueInstrument = {
          id: inst.id,
          exchange: inst.exchange as 'NSE' | 'BSE',
          symbol: inst.symbol,
          name: inst.name,
          sector: inst.sector || 'Equities',
          provider_instrument_key: inst.provider_instrument_key || `${inst.exchange}_EQ|${inst.symbol}`,
          isin: inst.provider_instrument_key?.split('|')[1] || '',
          active: inst.active !== false,
        };
        this.instruments.set(this.getCompositeKey(inst.exchange, inst.symbol), itemObj);
        if (itemObj.provider_instrument_key) {
          this.instrumentsByKey.set(itemObj.provider_instrument_key, itemObj);
        }
      }
      this.lastRefreshedAt = new Date().toISOString();
      console.log(`[Catalogue Service] Initialized ${this.instruments.size} instruments from persistent cache.`);
    }

    // If database only has seed data (< 20 instruments), trigger full catalogue ingestion in background
    if (this.instruments.size < 20) {
      this.syncFullCatalogue().catch(err => {
        console.error('[Catalogue Service Initial Sync Warning]:', err.message);
      });
    }
  }

  /**
   * Search, filter, sort, and paginate instruments
   */
  search(options: CatalogueQueryOptions): CatalogueQueryResult {
    const {
      search = '',
      exchange = 'ALL',
      sector = 'ALL',
      sortBy = 'symbol',
      sortOrder = 'asc',
      page = 1,
      limit = 25,
    } = options;

    const safePage = Math.max(1, Math.floor(Number(page) || 1));
    const safeLimit = Math.min(100, Math.max(1, Math.floor(Number(limit) || 25)));
    const cleanSearch = String(search).trim().toLowerCase();
    const cleanExchange = String(exchange).trim().toUpperCase();

    let filtered = Array.from(this.instruments.values()).filter(inst => inst.active);

    // Exchange filter
    if (cleanExchange === 'NSE' || cleanExchange === 'BSE') {
      filtered = filtered.filter(i => i.exchange === cleanExchange);
    }

    // Sector filter
    if (sector && sector !== 'ALL') {
      filtered = filtered.filter(i => i.sector.toLowerCase() === sector.toLowerCase());
    }

    // Search query matching (symbol prefix gets highest priority, then symbol contains, then name contains)
    if (cleanSearch) {
      filtered = filtered.filter(i => {
        const sym = i.symbol.toLowerCase();
        const name = i.name.toLowerCase();
        return sym.includes(cleanSearch) || name.includes(cleanSearch);
      });
    }

    // Sorting
    filtered.sort((a, b) => {
      // If search query is present and sorting by symbol, rank prefix matches higher
      if (cleanSearch && sortBy === 'symbol') {
        const aPrefix = a.symbol.toLowerCase().startsWith(cleanSearch);
        const bPrefix = b.symbol.toLowerCase().startsWith(cleanSearch);
        if (aPrefix && !bPrefix) return -1;
        if (!aPrefix && bPrefix) return 1;
      }

      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'exchange':
          comparison = a.exchange.localeCompare(b.exchange) || a.symbol.localeCompare(b.symbol);
          break;
        case 'price':
          comparison = (a.price || 0) - (b.price || 0);
          break;
        case 'changePct':
          comparison = (a.changePct || 0) - (b.changePct || 0);
          break;
        case 'volume':
          comparison = (a.volume || 0) - (b.volume || 0);
          break;
        case 'symbol':
        default:
          comparison = a.symbol.localeCompare(b.symbol);
          break;
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / safeLimit));
    const offset = (safePage - 1) * safeLimit;
    const paginatedSlice = filtered.slice(offset, offset + safeLimit);

    return {
      data: paginatedSlice,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages,
        exchange: cleanExchange,
        search: cleanSearch,
        sortBy,
        sortOrder,
      },
      stats: {
        totalInstruments: this.instruments.size,
        nseCount: this.getCountByExchange('NSE'),
        bseCount: this.getCountByExchange('BSE'),
        lastRefreshedAt: this.lastRefreshedAt,
      },
    };
  }

  getInstrument(exchange: string, symbol: string): CatalogueInstrument | null {
    return this.instruments.get(this.getCompositeKey(exchange, symbol)) || null;
  }

  getInstrumentByKey(key: string): CatalogueInstrument | null {
    return this.instrumentsByKey.get(key) || null;
  }

  getCountByExchange(exchange: 'NSE' | 'BSE'): number {
    let count = 0;
    for (const inst of this.instruments.values()) {
      if (inst.exchange === exchange && inst.active) count++;
    }
    return count;
  }

  getTotalCount(): number {
    return this.instruments.size;
  }

  getAll(): CatalogueInstrument[] {
    return Array.from(this.instruments.values());
  }

  updateInstrumentPrice(
    exchange: string,
    symbol: string,
    quote: {
      price?: number;
      open?: number;
      high?: number;
      low?: number;
      close?: number;
      prevClose?: number;
      change?: number;
      changePct?: number;
      volume?: number;
      tradingDate?: string;
      sourceMode?: string;
      freshness?: string;
      lastUpdatedIst?: string;
    }
  ): void {
    const inst = this.instruments.get(this.getCompositeKey(exchange, symbol));
    if (inst) {
      if (quote.price !== undefined) inst.price = quote.price;
      if (quote.open !== undefined) inst.open = quote.open;
      if (quote.high !== undefined) inst.high = quote.high;
      if (quote.low !== undefined) inst.low = quote.low;
      if (quote.close !== undefined) inst.close = quote.close;
      if (quote.prevClose !== undefined) inst.prevClose = quote.prevClose;
      if (quote.change !== undefined) inst.change = quote.change;
      if (quote.changePct !== undefined) inst.changePct = quote.changePct;
      if (quote.volume !== undefined) inst.volume = quote.volume;
      if (quote.tradingDate !== undefined) inst.tradingDate = quote.tradingDate;
      if (quote.sourceMode !== undefined) inst.sourceMode = quote.sourceMode;
      if (quote.freshness !== undefined) inst.freshness = quote.freshness;
      if (quote.lastUpdatedIst !== undefined) inst.lastUpdatedIst = quote.lastUpdatedIst;
    }
  }

  updateFromTejHQSnapshot(exchange: 'NSE' | 'BSE', rows: Array<any>, tradingDate?: string): number {
    let updated = 0;
    const nowIst = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date()) + ' IST';

    for (const r of rows) {
      const sym = r.symbol?.toUpperCase().trim();
      if (!sym) continue;
      const inst = this.instruments.get(this.getCompositeKey(exchange, sym));
      if (inst) {
        const closePrice = r.close || r.last || 0;
        const prevPrice = r.prev_close || closePrice;
        const change = Number((closePrice - prevPrice).toFixed(2));
        const changePct = prevPrice > 0 ? Number(((change / prevPrice) * 100).toFixed(2)) : 0;

        inst.price = closePrice;
        inst.open = r.open;
        inst.high = r.high;
        inst.low = r.low;
        inst.close = closePrice;
        inst.prevClose = prevPrice;
        inst.change = change;
        inst.changePct = changePct;
        inst.volume = r.volume;
        inst.turnover = r.turnover;
        inst.trades = r.trades;
        inst.tradingDate = tradingDate;
        inst.sourceMode = 'END_OF_DAY';
        inst.freshness = 'END_OF_DAY';
        inst.lastUpdatedIst = nowIst;
        updated++;
      }
    }
    return updated;
  }

  // Unit-test helper to inject mock data without network calls
  loadMockInstruments(instruments: CatalogueInstrument[]): void {
    this.instruments.clear();
    this.instrumentsByKey.clear();
    for (const inst of instruments) {
      this.instruments.set(this.getCompositeKey(inst.exchange, inst.symbol), inst);
      if (inst.provider_instrument_key) {
        this.instrumentsByKey.set(inst.provider_instrument_key, inst);
      }
    }
    this.lastRefreshedAt = new Date().toISOString();
  }
}

export const catalogueService = new CatalogueService();
