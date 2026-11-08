import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { stockExplanationService } from '../modules/analysis/stockExplanationService.js';
import { getProviderManager } from './systemRouter.js';

export const explanationRouter = Router();

// GET /api/explain/:exchange/:symbol
explanationRouter.get('/explain/:exchange/:symbol', async (req: Request, res: Response): Promise<void> => {
  try {
    const { exchange, symbol } = req.params;
    const timeframe = req.query.timeframe ? String(req.query.timeframe) : '15m';

    const sym = symbol.toUpperCase().trim();
    const ex = exchange.toUpperCase().trim();

    let inst = db.store.instruments.find(
      i => i.symbol.toUpperCase() === sym && i.exchange.toUpperCase() === ex
    ) || db.store.instruments.find(i => i.symbol.toUpperCase() === sym);

    if (!inst) {
      res.status(404).json({ error: `Instrument ${ex}:${sym} not found.` });
      return;
    }

    // Retrieve candles for explanation
    let candles = db.store.market_candles
      .filter(c => c.instrument_id === inst!.id)
      .sort((a, b) => new Date(a.candle_start).getTime() - new Date(b.candle_start).getTime());

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

    const explanation = await stockExplanationService.explainStock(sym, ex, candles, timeframe);

    res.json({
      success: true,
      data: explanation,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to explain stock' });
  }
});

// GET /api/explain/history
explanationRouter.get('/explain-history', (req: Request, res: Response): void => {
  try {
    const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : undefined;
    let list = db.store.stock_explanations || [];
    if (symbol) {
      list = list.filter(e => e.symbol === symbol);
    }
    res.json({
      success: true,
      count: list.length,
      data: list.slice(0, 20),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve explanation history' });
  }
});
