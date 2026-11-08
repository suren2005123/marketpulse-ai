import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { config } from '../config/index.js';
import { getProviderManager } from './systemRouter.js';
import { catalogueService } from '../modules/market/catalogueService.js';

export const marketRouter = Router();

// GET /api/instruments/catalogue (Search, Filter, Sort, Paginate over all NSE/BSE equities)
marketRouter.get('/instruments/catalogue', (req: Request, res: Response): void => {
  try {
    const {
      search = '',
      exchange = 'ALL',
      sector = 'ALL',
      sortBy = 'symbol',
      sortOrder = 'asc',
      page = '1',
      limit = '25',
    } = req.query;

    const validSortFields = ['symbol', 'name', 'exchange', 'price', 'changePct', 'volume'];
    const chosenSortBy = validSortFields.includes(String(sortBy)) ? String(sortBy) : 'symbol';
    const chosenSortOrder = String(sortOrder).toLowerCase() === 'desc' ? 'desc' : 'asc';

    const pageNum = parseInt(String(page), 10);
    const limitNum = parseInt(String(limit), 10);

    const safePage = isNaN(pageNum) || pageNum < 1 ? 1 : pageNum;
    const safeLimit = isNaN(limitNum) || limitNum < 1 ? 25 : Math.min(limitNum, 100);

    const result = catalogueService.search({
      search: String(search),
      exchange: String(exchange).toUpperCase() as any,
      sector: String(sector),
      sortBy: chosenSortBy as any,
      sortOrder: chosenSortOrder,
      page: safePage,
      limit: safeLimit,
    });

    const pm = getProviderManager();
    const activeMode = pm?.getCurrentMode?.() || config.appMode;

    const neededIds = new Set(result.data.filter(i => !(i.price !== undefined && i.price > 0)).map(i => i.id));
    const candlesByInst = new Map<string, any[]>();
    if (neededIds.size > 0 && Array.isArray(db.store?.market_candles)) {
      for (const c of db.store.market_candles) {
        if (neededIds.has(c.instrument_id)) {
          let list = candlesByInst.get(c.instrument_id);
          if (!list) {
            list = [];
            candlesByInst.set(c.instrument_id, list);
          }
          list.push(c);
        }
      }
    }

    const enrichedData = result.data.map(inst => {
      if (inst.price !== undefined && inst.price > 0) {
        return inst;
      }
      const candles = candlesByInst.get(inst.id);
      if (candles && candles.length > 0) {
        const sorted = [...candles].sort((a, b) => new Date(b.candle_start).getTime() - new Date(a.candle_start).getTime());
        const latest = sorted[0];
        const prev = sorted[1] || latest;
        const change = Number((latest.close - prev.close).toFixed(2));
        const changePct = prev.close > 0 ? Number(((change / prev.close) * 100).toFixed(2)) : 0;
        return {
          ...inst,
          price: latest.close,
          open: latest.open,
          high: latest.high,
          low: latest.low,
          close: latest.close,
          prevClose: prev.close,
          change,
          changePct,
          volume: latest.volume,
          sourceMode: latest.source_mode || activeMode,
          freshness: latest.source_mode || activeMode,
          tradingDate: latest.candle_start ? new Date(latest.candle_start).toISOString().split('T')[0] : undefined,
        };
      }
      return inst;
    });

    res.json({
      success: true,
      data: enrichedData,
      pagination: result.pagination,
      stats: result.stats,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve instrument catalogue' });
  }
});

// POST /api/instruments/refresh (Trigger manual catalogue refresh from official Upstox masters)
marketRouter.post('/instruments/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await catalogueService.syncFullCatalogue();
    res.json({
      success: true,
      message: `Successfully synchronized ${result.total} instruments from official masters.`,
      stats: result,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to refresh catalogue' });
  }
});

// GET /api/instruments (Legacy/General listing)
marketRouter.get('/instruments', (req: Request, res: Response) => {
  try {
    const limitParam = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const allInstruments = db.store.instruments.filter(i => i.active);
    const data = limitParam ? allInstruments.slice(0, limitParam) : allInstruments;

    res.json({
      success: true,
      count: data.length,
      totalCount: allInstruments.length,
      data,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve instruments' });
  }
});

// GET /api/market/:exchange/:symbol/quote
marketRouter.get('/market/:exchange/:symbol/quote', async (req: Request, res: Response): Promise<void> => {
  try {
    const { symbol, exchange } = req.params;
    const providerManager = getProviderManager();
    const activeMode = providerManager?.getCurrentMode?.() || config.appMode;

    let inst = db.store.instruments.find(
      i => i.symbol.toUpperCase() === symbol.toUpperCase() && i.exchange.toUpperCase() === exchange.toUpperCase()
    );
    if (!inst) {
      inst = db.store.instruments.find(i => i.symbol.toUpperCase() === symbol.toUpperCase());
    }
    const resolvedExchange = inst ? inst.exchange : exchange.toUpperCase();

    // If in END_OF_DAY mode or provider is TejHQ, query genuine data
    if (activeMode === 'END_OF_DAY' || config.provider.name.toLowerCase() === 'tejhq') {
      const tejhq = providerManager?.getTejHQAdapter();
      if (tejhq) {
        const tejQuote = await tejhq.getQuote(resolvedExchange, symbol);
        if (tejQuote) {
          // Ensure instrument exists in DB for watchlist and alert relations
          const instId = inst?.id || `inst-${resolvedExchange.toLowerCase()}-${symbol.toLowerCase()}`;
          await db.upsertInstrument({
            id: instId,
            exchange: tejQuote.exchange,
            symbol: tejQuote.symbol,
            name: tejQuote.name,
            sector: inst?.sector || 'Equities',
            provider_instrument_key: inst?.provider_instrument_key || tejQuote.isin,
          });

          res.json({
            success: true,
            data: {
              symbol: tejQuote.symbol,
              exchange: tejQuote.exchange,
              name: tejQuote.name,
              sector: inst?.sector || 'Equities',
              price: tejQuote.price,
              open: tejQuote.open,
              high: tejQuote.high,
              low: tejQuote.low,
              close: tejQuote.close,
              prevClose: tejQuote.prevClose,
              change: tejQuote.change,
              changePct: tejQuote.changePct,
              volume: tejQuote.volume,
              timestamp: tejQuote.timestamp,
              tradingDate: tejQuote.tradingDate,
              lastUpdatedIst: tejQuote.lastUpdatedIst,
              sourceMode: 'END_OF_DAY',
              provider: tejQuote.provider,
              freshness: 'END_OF_DAY',
            },
          });
          return;
        }
      }
    }

    if (!inst) {
      res.status(404).json({ error: `Instrument ${exchange}:${symbol} not found.` });
      return;
    }

    // Fallback to persisted candles (e.g. simulated or cached mode)
    const candles = db.store.market_candles
      .filter(c => c.instrument_id === inst!.id)
      .sort((a, b) => new Date(b.candle_start).getTime() - new Date(a.candle_start).getTime());

    const latest = candles[0];
    const prev = candles[1] || latest;

    const price = latest ? latest.close : 1000;
    const prevPrice = prev ? prev.close : price;
    const change = Number((price - prevPrice).toFixed(2));
    const changePct = Number(((change / prevPrice) * 100).toFixed(2));

    res.json({
      success: true,
      data: {
        symbol: inst.symbol,
        exchange: inst.exchange,
        name: inst.name,
        sector: inst.sector,
        price,
        open: latest ? latest.open : price,
        high: latest ? latest.high : price,
        low: latest ? latest.low : price,
        close: price,
        prevClose: prevPrice,
        change,
        changePct,
        volume: latest ? latest.volume : 0,
        timestamp: latest ? latest.candle_start : new Date().toISOString(),
        sourceMode: latest ? latest.source_mode : 'SIMULATED',
        provider: latest ? latest.provider : 'MarketPulse',
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve quote' });
  }
});

// GET /api/market/:exchange/:symbol/candles
marketRouter.get('/market/:exchange/:symbol/candles', async (req: Request, res: Response): Promise<void> => {
  try {
    const { symbol, exchange } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string || '100', 10), 500);
    const providerManager = getProviderManager();
    const activeMode = providerManager?.getCurrentMode?.() || config.appMode;

    let inst = db.store.instruments.find(
      i => i.symbol.toUpperCase() === symbol.toUpperCase() && i.exchange.toUpperCase() === exchange.toUpperCase()
    );
    if (!inst) {
      inst = db.store.instruments.find(i => i.symbol.toUpperCase() === symbol.toUpperCase());
    }
    const resolvedExchange = inst ? inst.exchange : exchange.toUpperCase();

    // If in END_OF_DAY mode or provider is TejHQ, fetch genuine historical OHLCV
    if (activeMode === 'END_OF_DAY' || config.provider.name.toLowerCase() === 'tejhq') {
      const tejhq = providerManager?.getTejHQAdapter();
      if (tejhq) {
        const candles = await tejhq.getCandles(resolvedExchange, symbol, limit);
        if (candles && candles.length > 0) {
          const instId = inst?.id || `inst-${resolvedExchange.toLowerCase()}-${symbol.toLowerCase()}`;
          // Asynchronously persist candles with unique constraint
          tejhq.syncCandlesToDatabase(resolvedExchange, symbol, instId, 50).catch(() => {});

          res.json({
            success: true,
            symbol: symbol.toUpperCase(),
            exchange: exchange.toUpperCase(),
            count: candles.length,
            sourceMode: 'END_OF_DAY',
            provider: 'TejHQ',
            tradingDate: candles[candles.length - 1]?.date,
            data: candles.map((c: any) => ({
              id: c.id,
              timestamp: c.timestamp,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
              volume: c.volume,
              sourceMode: 'END_OF_DAY',
            })),
          });
          return;
        }
      }
    }

    if (!inst) {
      res.status(404).json({ error: `Instrument ${exchange}:${symbol} not found.` });
      return;
    }

    const candles = db.store.market_candles
      .filter(c => c.instrument_id === inst!.id)
      .sort((a, b) => new Date(a.candle_start).getTime() - new Date(b.candle_start).getTime())
      .slice(-limit);

    res.json({
      success: true,
      symbol: inst.symbol,
      exchange: inst.exchange,
      count: candles.length,
      data: candles.map(c => ({
        id: c.id,
        timestamp: c.candle_start,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        sourceMode: c.source_mode,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve candles' });
  }
});
