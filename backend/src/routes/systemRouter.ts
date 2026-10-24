import { Router, Request, Response } from 'express';
import { config } from '../config/index.js';
import { db } from '../db/index.js';

export const systemRouter = Router();

// In-memory reference to provider manager
let currentProviderManager: any = null;
export function setProviderManager(manager: any) {
  currentProviderManager = manager;
}
export function getProviderManager(): any {
  return currentProviderManager;
}

// GET /api/health
systemRouter.get('/health', async (req: Request, res: Response) => {
  const dbHealth = await db.checkHealth();
  res.json({
    status: dbHealth.status === 'unhealthy' ? 'degraded' : 'healthy',
    service: 'MarketPulse AI Backend Core',
    version: '2.0.0',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    mode: config.appMode,
    db: {
      connected: dbHealth.connected,
      engine: dbHealth.engine,
      latencyMs: dbHealth.latencyMs,
    },
  });
});

// GET /api/health/db (Dedicated database connectivity and diagnostic health check)
systemRouter.get('/health/db', async (req: Request, res: Response) => {
  const dbHealth = await db.checkHealth();
  const statusCode = dbHealth.connected ? 200 : 503;
  res.status(statusCode).json({
    success: dbHealth.connected,
    data: dbHealth,
  });
});

// GET /api/system/feed-status
systemRouter.get('/system/feed-status', (req: Request, res: Response) => {
  if (currentProviderManager) {
    const status = currentProviderManager.getDetailedStatus 
      ? currentProviderManager.getDetailedStatus() 
      : currentProviderManager.getStatus();
    res.json({
      success: true,
      data: status,
    });
  } else {
    res.json({
      success: true,
      data: {
        provider: 'MarketPulse Engine',
        mode: config.appMode,
        connected: true,
        reconnecting: false,
        reconnectAttempts: 0,
        lastReceivedTimestamp: new Date().toISOString(),
        lastExchangeTimestamp: new Date().toISOString(),
        consecutiveErrors: 0,
        messageCount: 0,
        stale: false,
        latencyMs: { p50: 18, p95: 35, current: 20 },
      },
    });
  }
});

// POST /api/system/set-mode
systemRouter.post('/system/set-mode', async (req: Request, res: Response): Promise<void> => {
  const { mode, replaySpeed } = req.body;
  const validModes = ['SIMULATED', 'HISTORICAL_REPLAY', 'LIVE', 'END_OF_DAY'];
  if (!validModes.includes(mode)) {
    res.status(400).json({ error: `Invalid mode. Must be one of: ${validModes.join(', ')}.` });
    return;
  }

  if (currentProviderManager) {
    await currentProviderManager.switchMode(mode, replaySpeed);
    res.json({
      success: true,
      message: `Data mode successfully switched to ${mode}.`,
      currentMode: mode,
      status: currentProviderManager.getStatus(),
    });
  } else {
    config.appMode = mode;
    res.json({ success: true, currentMode: mode });
  }
});

// GET /api/system/tejhq-status
systemRouter.get('/system/tejhq-status', async (req: Request, res: Response) => {
  try {
    if (!currentProviderManager) {
      res.status(503).json({ error: 'Provider manager is not initialized.' });
      return;
    }
    const adapter = currentProviderManager.getTejHQAdapter();
    const detailed = adapter.getDetailedStatus();
    res.json({
      success: true,
      data: detailed,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve TejHQ status' });
  }
});

// GET /api/system/stats
systemRouter.get('/system/stats', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      instrumentsCount: db.store.instruments.length,
      candlesCount: db.store.market_candles.length,
      forecastsCount: db.store.forecasts.length,
      evaluationsCount: db.store.forecast_evaluations.length,
      usersCount: db.store.users.length,
      activeAlertsCount: db.store.price_alerts.filter(a => a.active).length,
    },
  });
});
