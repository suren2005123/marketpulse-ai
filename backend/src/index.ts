import http from 'http';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

import { config } from './config/index.js';
import { db } from './db/index.js';
import { seedDatabase } from './db/seed.js';
import { CandleAggregator } from './modules/market/candleAggregator.js';
import { RealtimeGateway } from './realtime/socketGateway.js';
import { ProviderManager } from './modules/provider/providerManager.js';
import { catalogueService } from './modules/market/catalogueService.js';

import { authRouter } from './modules/auth/authRouter.js';
import { marketRouter } from './routes/marketRouter.js';
import { forecastsRouter } from './routes/forecastsRouter.js';
import { alertsRouter } from './routes/alertsRouter.js';
import { watchlistRouter } from './routes/watchlistRouter.js';
import { systemRouter, setProviderManager } from './routes/systemRouter.js';
import { providerRouter } from './routes/providerRouter.js';

async function bootstrap() {
  const app = express();
  const server = http.createServer(app);

  // Security & standard middlewares
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  app.use(cors({
    origin: [config.frontendUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  app.use(cookieParser());
  app.use(express.json());

  // Request logger
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!req.url.startsWith('/api/health') && !req.url.startsWith('/socket.io')) {
      console.log(`[HTTP] ${req.method} ${req.url}`);
    }
    next();
  });

  // 1. Initialize Database
  await db.init();

  // If database is completely empty, run initial seed
  if (db.store.users.length === 0 || db.store.instruments.length === 0) {
    console.log('[Bootstrap] Initializing and seeding database...');
    await seedDatabase();
  }

  // 1b. Initialize Instrument Catalogue from cache / master
  await catalogueService.initializeFromDatabase();

  // 2. Initialize Candle Aggregator & Latency Monitor
  const candleAggregator = new CandleAggregator();

  // 3. Initialize Socket.IO Real-time Gateway with Redis adapter
  const realtimeGateway = new RealtimeGateway(server, candleAggregator);

  // 4. Initialize Provider Manager (defaults to SIMULATED for safe, deterministic launch)
  const providerManager = new ProviderManager(config.appMode);
  setProviderManager(providerManager);
  realtimeGateway.bindProvider(providerManager);
  await providerManager.start();

  // 5. Mount API Routes
  app.use('/api/auth', authRouter);
  app.use('/api', systemRouter);
  app.use('/api', marketRouter);
  app.use('/api', forecastsRouter);
  app.use('/api', alertsRouter);
  app.use('/api', watchlistRouter);
  app.use('/api', providerRouter);

  // 404 Route Handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
  });

  // Centralized Error Handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('[Unhandled Error]:', err);
    res.status(err.status || 500).json({
      error: err.message || 'Internal server error occurred.',
      code: err.code || 'INTERNAL_ERROR',
    });
  });

  // Start Server
  server.listen(config.port, () => {
    console.log('=============================================================');
    console.log(` MarketPulse AI Backend running on http://localhost:${config.port}`);
    console.log(` Mode: ${config.appMode} | Real-Time Latency Budget: ${config.latencyBudgetMs}ms`);
    console.log(` Demo Account: demo@marketpulse.ai / DemoPassword123!`);
    console.log('=============================================================');
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[Shutdown] Closing MarketPulse AI services...');
    await providerManager.getActiveProvider().disconnect();
    server.close(() => {
      console.log('[Shutdown] Server closed cleanly.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch(err => {
  console.error('[Fatal Bootstrap Error]:', err);
  process.exit(1);
});
