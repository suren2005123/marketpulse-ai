import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { config } from '../config/index.js';
import { TokenService, TokenPayload } from '../modules/auth/tokenService.js';
import { IMarketDataProvider, MarketTick } from '../modules/provider/types.js';
import { CandleAggregator, FinalizedCandle } from '../modules/market/candleAggregator.js';
import { alertEngine } from '../modules/alerts/alertEngine.js';
import { forecastService } from '../modules/forecasts/forecastService.js';

interface AuthenticatedSocket extends Socket {
  user?: TokenPayload;
}

export class RealtimeGateway {
  private io: Server;
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  private candleAggregator: CandleAggregator;
  private activeProvider: IMarketDataProvider | null = null;

  constructor(httpServer: HttpServer, candleAggregator: CandleAggregator) {
    this.candleAggregator = candleAggregator;
    this.io = new Server(httpServer, {
      cors: {
        origin: config.frontendUrl,
        credentials: true,
        methods: ['GET', 'POST'],
      },
      pingTimeout: 10000,
      pingInterval: 15000,
    });

    this.setupRedisAdapter();
    this.setupSocketAuth();
    this.setupEventHandlers();
  }

  private async setupRedisAdapter(): Promise<void> {
    if (config.redis.url && config.redis.url !== 'mock') {
      try {
        this.pubClient = new Redis(config.redis.url, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
        this.subClient = this.pubClient.duplicate();

        await Promise.all([
          new Promise((resolve, reject) => {
            this.pubClient!.on('connect', resolve);
            this.pubClient!.on('error', reject);
          }),
          new Promise((resolve, reject) => {
            this.subClient!.on('connect', resolve);
            this.subClient!.on('error', reject);
          }),
        ]);

        this.io.adapter(createAdapter(this.pubClient, this.subClient));
        console.log('[Realtime] Redis pub/sub adapter connected and active for horizontal clustering.');
        return;
      } catch (err: any) {
        console.warn(`[Realtime] Redis connection failed (${err.message}). Using high-performance in-memory pub/sub adapter.`);
        if (this.pubClient) { this.pubClient.disconnect(); this.pubClient = null; }
        if (this.subClient) { this.subClient.disconnect(); this.subClient = null; }
      }
    } else {
      console.log('[Realtime] Running with local in-memory pub/sub adapter.');
    }
  }

  private setupSocketAuth(): void {
    this.io.use((socket: AuthenticatedSocket, next) => {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
      
      // Allow demo preview if configured, or require authentication
      if (!token) {
        return next(new Error('Authentication error: Token required in auth handshake'));
      }

      const payload = TokenService.verifyAccessToken(token);
      if (!payload) {
        return next(new Error('Authentication error: Invalid or expired access token'));
      }

      socket.user = payload;
      next();
    });
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      const user = socket.user;
      if (!user) {
        socket.disconnect();
        return;
      }

      // Join user-specific room for private alerts
      const userRoom = `user:${user.userId}`;
      socket.join(userRoom);
      console.log(`[Socket] User ${user.email} (${user.userId}) connected. Joined room: ${userRoom}`);

      // Send initial status immediately upon connection
      if (this.activeProvider) {
        socket.emit('provider:status', {
          ...this.activeProvider.getStatus(),
          latencyStats: this.candleAggregator.getLatencyStats(),
        });
      }

      // Handle subscription changes from client
      socket.on('subscribe:instruments', (symbols: string[]) => {
        if (Array.isArray(symbols) && this.activeProvider) {
          this.activeProvider.subscribe(symbols);
        }
      });

      // Handle client-reported latency echo (for measuring true round-trip screen delivery)
      socket.on('latency:ping', (timestamp: number) => {
        socket.emit('latency:pong', timestamp);
      });

      socket.on('disconnect', (reason) => {
        console.log(`[Socket] User ${user.email} disconnected (${reason}).`);
      });
    });

    // Listen to finalized candles from aggregator
    this.candleAggregator.on('candle:closed', async (candle: FinalizedCandle) => {
      // 1. Broadcast finalized candle to all clients
      this.io.emit('candle:closed', candle);

      // 2. Trigger ML rolling forecasts for this instrument
      try {
        const forecasts = await forecastService.generateForecastsForInstrument(candle.symbol, candle.exchange);
        if (forecasts.length > 0) {
          this.io.emit('forecast:update', {
            symbol: candle.symbol,
            exchange: candle.exchange,
            forecasts,
          });
        }
      } catch (err: any) {
        console.error('[Forecast Error]:', err.message);
      }
    });
  }

  bindProvider(provider: IMarketDataProvider): void {
    this.activeProvider = provider;

    provider.on('tick', (tick: MarketTick) => {
      // 1. Process tick through candle aggregator
      const { quote, latencyMs } = this.candleAggregator.processTick(tick);
      if (!quote) return;

      // 2. Broadcast live market quote update to all authenticated sockets
      this.io.emit('market:update', quote);

      // 3. Evaluate user alerts
      const triggeredAlerts = alertEngine.evaluate(quote);
      for (const alertEvent of triggeredAlerts) {
        // Private emit ONLY to the owning user's room!
        this.io.to(`user:${alertEvent.userId}`).emit('alert:triggered', alertEvent);
        console.log(`[Alert Dispatched] User ${alertEvent.userId} received alert on ${alertEvent.symbol}: ${alertEvent.message}`);
      }

      // 4. Evaluate pending forecasts against new price
      const evaluations = forecastService.evaluatePendingForecasts(quote.symbol, quote.price);
      for (const evalItem of evaluations) {
        this.io.emit('forecast:evaluated', evalItem);
      }
    });

    provider.on('status', (status) => {
      this.io.emit('provider:status', {
        ...status,
        latencyStats: this.candleAggregator.getLatencyStats(),
      });
    });
  }

  getSocketServer(): Server {
    return this.io;
  }
}
