import { Router, Request, Response } from 'express';
import { InsightsService } from '../modules/market/insightsService.js';

export const insightsRouter = Router();
const svc = new InsightsService();

// GET /api/insights/overview/:exchange? (exchange = NSE|BSE|ALL)
insightsRouter.get('/overview/:exchange?', (req: Request, res: Response) => {
  const exchange = (req.params.exchange?.toUpperCase() as 'NSE' | 'BSE' | 'ALL') || 'ALL';
  try {
    const data = svc.getMarketOverview(exchange);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to compute market overview' });
  }
});

// GET /api/insights/top-movers/:exchange?/:limit?
insightsRouter.get('/top-movers/:exchange?/:limit?', (req: Request, res: Response) => {
  const exchange = (req.params.exchange?.toUpperCase() as 'NSE' | 'BSE' | 'ALL') || 'ALL';
  const limit = parseInt(req.params.limit || '5', 10);
  try {
    const data = svc.getTopMovers(exchange, limit);
    res.json({ success: true, ...data });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to compute top movers' });
  }
});

// GET /api/insights/most-active/:exchange?/:limit?
insightsRouter.get('/most-active/:exchange?/:limit?', (req: Request, res: Response) => {
  const exchange = (req.params.exchange?.toUpperCase() as 'NSE' | 'BSE' | 'ALL') || 'ALL';
  const limit = parseInt(req.params.limit || '5', 10);
  try {
    const data = svc.getMostActive(exchange, limit);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to compute most active stocks' });
  }
});

// GET /api/insights/sector-performance/:exchange?
insightsRouter.get('/sector-performance/:exchange?', (req: Request, res: Response) => {
  const exchange = (req.params.exchange?.toUpperCase() as 'NSE' | 'BSE' | 'ALL') || 'ALL';
  try {
    const data = svc.getSectorPerformance(exchange);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to compute sector performance' });
  }
});

// Placeholder AI observation endpoint – returns deterministic observations based on data trends.
insightsRouter.get('/observations/:exchange?', (req: Request, res: Response) => {
  const exchange = (req.params.exchange?.toUpperCase() as 'NSE' | 'BSE' | 'ALL') || 'ALL';
  try {
    const overview = svc.getMarketOverview(exchange);
    const observations: string[] = [];
    if (overview.advances > overview.declines) {
      observations.push('Market breadth shows more advancing stocks than declining stocks, indicating bullish sentiment.');
    } else if (overview.declines > overview.advances) {
      observations.push('Market breadth shows more declining stocks than advancing stocks, indicating bearish pressure.');
    } else {
      observations.push('Market breadth is balanced between advances and declines.');
    }
    // Simple volume cue
    if (overview.totalVolume > 1e9) {
      observations.push('High aggregate trading volume suggests strong participation across the market.');
    }
    res.json({ success: true, observations });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate observations' });
  }
});
