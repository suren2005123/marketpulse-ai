import { Router, Request, Response } from 'express';
import { anomalyRadarService } from '../modules/radar/anomalyRadarService.js';
import { marketInvestigatorService } from '../modules/radar/investigatorService.js';
import { db } from '../db/index.js';
import { TokenService } from '../modules/auth/tokenService.js';

export const radarRouter = Router();

// Middleware to extract authenticated user if token present
function getUserId(req: Request): string {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    const payload = TokenService.verifyAccessToken(token);
    if (payload?.userId) return payload.userId;
  }
  return 'demo-user-dev';
}

// GET /api/radar/scan
radarRouter.get('/scan', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      exchange = 'ALL',
      severity = 'ALL',
      sector = 'ALL',
      search = '',
      minScore,
      watchlistOnly,
      scanMode,
    } = req.query;

    const userId = getUserId(req);

    // Fetch user watchlisted symbols if needed
    let userWatchlistSymbols: string[] = [];
    const watchlists = db.store.user_watchlists.filter(w => w.user_id === userId);
    for (const w of watchlists) {
      const inst = db.store.instruments.find(i => i.id === w.instrument_id);
      if (inst?.symbol) userWatchlistSymbols.push(inst.symbol);
    }

    const scanResult = await anomalyRadarService.runRadarScan({
      exchange: String(exchange).toUpperCase() as any,
      severity: String(severity).toUpperCase() as any,
      sector: String(sector),
      search: String(search),
      minScore: minScore ? Number(minScore) : undefined,
      watchlistOnly: watchlistOnly === 'true',
      userWatchlistSymbols,
      scanMode: scanMode === 'INTRADAY' ? 'INTRADAY' : 'EOD',
    });

    res.json({
      success: true,
      ...scanResult,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to execute Anomaly Radar scan' });
  }
});

// GET /api/radar/anomalies (Paginated anomalies list)
radarRouter.get('/anomalies', async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = '1', limit = '20', exchange, severity, sector, search } = req.query;
    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));

    const scan = await anomalyRadarService.runRadarScan({
      exchange: exchange ? String(exchange).toUpperCase() as any : 'ALL',
      severity: severity ? String(severity).toUpperCase() as any : 'ALL',
      sector: sector ? String(sector) : 'ALL',
      search: search ? String(search) : undefined,
    });

    const total = scan.anomalies.length;
    const totalPages = Math.max(1, Math.ceil(total / limitNum));
    const offset = (pageNum - 1) * limitNum;
    const data = scan.anomalies.slice(offset, offset + limitNum);

    res.json({
      success: true,
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
      },
      summary: scan.summary,
      dataSource: scan.dataSource,
      timestamp: scan.timestamp,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve anomalies' });
  }
});

// GET /api/radar/backtest (Historical backtest & alert quality metrics)
radarRouter.get('/backtest', async (req: Request, res: Response): Promise<void> => {
  try {
    const days = req.query.days ? parseInt(String(req.query.days), 10) : 30;
    const backtest = await anomalyRadarService.runHistoricalBacktest(days);
    res.json({
      success: true,
      data: backtest,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to compute backtesting metrics' });
  }
});

// GET /api/radar/rules (User watchlist anomaly rules)
radarRouter.get('/rules', (req: Request, res: Response): void => {
  try {
    const userId = getUserId(req);
    const rules = anomalyRadarService.getUserRules(userId);
    res.json({
      success: true,
      data: rules,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve user anomaly rules' });
  }
});

// POST /api/radar/rules (Save new anomaly rule)
radarRouter.post('/rules', (req: Request, res: Response): void => {
  try {
    const userId = getUserId(req);
    const {
      symbol,
      exchange = 'NSE',
      watchlistId,
      returnZThreshold = 2.5,
      volumeSpikeMultiplier = 3.0,
      volatilityThreshold = 2.0,
      sectorDivergenceThreshold = 3.0,
      severityMin = 'ELEVATED',
    } = req.body;

    const saved = anomalyRadarService.saveUserRule(userId, {
      symbol: symbol ? String(symbol).toUpperCase() : undefined,
      exchange: String(exchange).toUpperCase(),
      watchlistId,
      returnZThreshold: Number(returnZThreshold),
      volumeSpikeMultiplier: Number(volumeSpikeMultiplier),
      volatilityThreshold: Number(volatilityThreshold),
      sectorDivergenceThreshold: Number(sectorDivergenceThreshold),
      severityMin: severityMin || 'ELEVATED',
      active: true,
    });

    res.status(201).json({
      success: true,
      data: saved,
      message: 'Anomaly alert rule created successfully.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save anomaly rule' });
  }
});

// DELETE /api/radar/rules/:id
radarRouter.delete('/rules/:id', (req: Request, res: Response): void => {
  try {
    const userId = getUserId(req);
    const ruleId = req.params.id;
    const deleted = anomalyRadarService.deleteUserRule(userId, ruleId);
    res.json({
      success: true,
      deleted,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete anomaly rule' });
  }
});

// GET /api/investigator/:exchange/:symbol (Investigate move on date)
radarRouter.get('/investigate/:exchange/:symbol', async (req: Request, res: Response): Promise<void> => {
  try {
    const { exchange, symbol } = req.params;
    const date = req.query.date ? String(req.query.date) : undefined;

    const investigation = await marketInvestigatorService.investigateMove(exchange, symbol, date);
    res.json({
      success: true,
      data: investigation,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to execute Market Move Investigation' });
  }
});
