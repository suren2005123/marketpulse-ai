import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/authMiddleware.js';

export const watchlistRouter = Router();

// Require authentication for all watchlist operations
watchlistRouter.use('/watchlist', authenticateToken);

const addWatchlistSchema = z.object({
  instrumentId: z.string().min(1, 'Instrument ID or Symbol is required'),
});

// GET /api/watchlist
watchlistRouter.get('/watchlist', (req: AuthenticatedRequest, res: Response): void => {
  try {
    const userId = req.user!.userId;
    const userWatchlist = db.store.user_watchlists.filter(w => w.user_id === userId);

    const enriched = userWatchlist.map(w => {
      const inst = db.store.instruments.find(i => i.id === w.instrument_id);
      if (!inst) return null;

      // Find latest quote
      const candles = db.store.market_candles
        .filter(c => c.instrument_id === inst.id)
        .sort((a, b) => new Date(b.candle_start).getTime() - new Date(a.candle_start).getTime());

      const latest = candles[0];
      const prev = candles[1] || latest;
      const price = latest ? Number(latest.close) : 1000;
      const prevPrice = prev ? Number(prev.close) : price;
      const change = Number((price - prevPrice).toFixed(2));
      const changePct = Number(((change / prevPrice) * 100).toFixed(2));

      return {
        instrumentId: inst.id,
        symbol: inst.symbol,
        exchange: inst.exchange,
        name: inst.name,
        sector: inst.sector,
        price,
        change,
        changePct,
        volume: latest ? Number(latest.volume) : 0,
        addedAt: w.added_at,
        sourceMode: latest ? latest.source_mode : 'SIMULATED',
      };
    }).filter(Boolean);

    res.json({
      success: true,
      count: enriched.length,
      data: enriched,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve watchlist' });
  }
});

// POST /api/watchlist
watchlistRouter.post('/watchlist', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const parse = addWatchlistSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: 'Invalid input', details: parse.error.flatten() });
      return;
    }

    const { instrumentId } = parse.data;
    const inst = db.store.instruments.find(i => i.id === instrumentId || i.symbol.toUpperCase() === instrumentId.toUpperCase());
    if (!inst) {
      res.status(404).json({ error: 'Instrument not found.' });
      return;
    }

    // Check if already in user's watchlist
    const exists = db.store.user_watchlists.some(w => w.user_id === userId && w.instrument_id === inst.id);
    if (exists) {
      res.status(409).json({ error: `${inst.symbol} is already in your watchlist.` });
      return;
    }

    await db.insertWatchlist(userId, inst.id);

    res.status(201).json({
      success: true,
      message: `${inst.symbol} added to watchlist`,
      data: {
        instrumentId: inst.id,
        symbol: inst.symbol,
        exchange: inst.exchange,
        name: inst.name,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to add to watchlist' });
  }
});

// DELETE /api/watchlist/:instrumentId
watchlistRouter.delete('/watchlist/:instrumentId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { instrumentId } = req.params;

    const inst = db.store.instruments.find(i => i.id === instrumentId || i.symbol.toUpperCase() === instrumentId.toUpperCase());
    const targetInstId = inst ? inst.id : instrumentId;

    const exists = db.store.user_watchlists.some(w => w.user_id === userId && w.instrument_id === targetInstId);
    if (!exists) {
      res.status(404).json({ error: 'Item not found in your watchlist' });
      return;
    }

    await db.removeWatchlist(userId, targetInstId);

    res.json({
      success: true,
      message: 'Item removed from watchlist',
      removedId: targetInstId,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to remove from watchlist' });
  }
});
