import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { trendAnalysisService } from '../modules/analysis/trendAnalysisService.js';
import { getProviderManager } from './systemRouter.js';
import { config } from '../config/index.js';

export const trendRouter = Router();

// GET /api/trends/:exchange/:symbol
trendRouter.get('/trends/:exchange/:symbol', async (req: Request, res: Response): Promise<void> => {
  try {
    const { exchange, symbol } = req.params;
    const timeframe = req.query.timeframe ? String(req.query.timeframe) : '15m';

    const sym = symbol.toUpperCase().trim();
    const ex = exchange.toUpperCase().trim();

    let inst = db.store.instruments.find(
      i => i.symbol.toUpperCase() === sym && i.exchange.toUpperCase() === ex
    );
    if (!inst) {
      inst = db.store.instruments.find(i => i.symbol.toUpperCase() === sym);
    }

    if (!inst) {
      res.status(404).json({ error: `Instrument ${ex}:${sym} not found.` });
      return;
    }

    // Retrieve candles for analysis
    let candles = db.store.market_candles
      .filter(c => c.instrument_id === inst!.id)
      .sort((a, b) => new Date(a.candle_start).getTime() - new Date(b.candle_start).getTime());

    // If persisted candles are scarce, check provider adapter
    if (candles.length < 15) {
      const pm = getProviderManager();
      const tejhq = pm?.getTejHQAdapter();
      if (tejhq) {
        const remoteCandles = await tejhq.getCandles(ex, sym, 50).catch(() => []);
        if (remoteCandles && remoteCandles.length > 0) {
          candles = remoteCandles;
        }
      }
    }

    const result = trendAnalysisService.analyzeTrend(sym, ex, candles, timeframe);

    res.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to analyze trend' });
  }
});

// GET /api/trends/overview (Market-wide trend breakdown across core equities)
trendRouter.get('/trends/overview', async (req: Request, res: Response): Promise<void> => {
  try {
    const activeInstruments = db.store.instruments.filter(i => i.active).slice(0, 15);
    const results: any[] = [];

    for (const inst of activeInstruments) {
      const candles = db.store.market_candles
        .filter(c => c.instrument_id === inst.id)
        .sort((a, b) => new Date(a.candle_start).getTime() - new Date(b.candle_start).getTime());

      const trend = trendAnalysisService.analyzeTrend(inst.symbol, inst.exchange, candles, '15m');
      results.push({
        symbol: inst.symbol,
        exchange: inst.exchange,
        name: inst.name,
        sector: inst.sector,
        currentPrice: trend.indicators.currentPrice,
        classification: trend.classification,
        confidenceScore: trend.confidenceScore,
        strengthLabel: trend.strengthLabel,
        rsi: trend.indicators.rsi,
        macdHistogram: trend.indicators.macd.histogram,
        relativeVolume: trend.indicators.volume.relativeVolume,
      });
    }

    const counts = {
      bullish: results.filter(r => r.classification === 'BULLISH').length,
      bearish: results.filter(r => r.classification === 'BEARISH').length,
      sideways: results.filter(r => r.classification === 'SIDEWAYS').length,
      mixed: results.filter(r => r.classification === 'MIXED / UNCERTAIN').length,
      total: results.length,
    };

    const marketSentiment =
      counts.bullish > counts.bearish + 2
        ? 'BULLISH_BIAS'
        : counts.bearish > counts.bullish + 2
        ? 'BEARISH_BIAS'
        : 'NEUTRAL_BALANCED';

    res.json({
      success: true,
      summary: {
        sentiment: marketSentiment,
        counts,
        timestamp: new Date().toISOString(),
      },
      data: results,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve trend overview' });
  }
});
