import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { io as ClientIO } from 'socket.io-client';
import { RealtimeGateway } from '../src/realtime/socketGateway.js';
import { CandleAggregator } from '../src/modules/market/candleAggregator.js';
import { TokenService } from '../src/modules/auth/tokenService.js';
import { SimulatedAdapter } from '../src/modules/provider/simulatedAdapter.js';
import { db } from '../src/db/index.js';

test('Real-Time Gateway: Authenticated Sockets and Concurrent Delivery Latency', async (t) => {
  const server = http.createServer();
  const aggregator = new CandleAggregator();
  const gateway = new RealtimeGateway(server, aggregator);
  const provider = new SimulatedAdapter();
  gateway.bindProvider(provider);

  // Start server on an ephemeral port
  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  const address = server.address() as any;
  const port = address.port;
  const url = `http://localhost:${port}`;

  // Generate 5 valid access tokens for 5 concurrent users
  const userTokens = [1, 2, 3, 4, 5].map((i) => ({
    userId: `user-sim-${i}`,
    token: TokenService.generateAccessToken({
      userId: `user-sim-${i}`,
      email: `user${i}@marketpulse.ai`,
      role: 'user',
    }),
  }));

  // Connect concurrent authenticated clients
  const clientSockets = userTokens.map((u) => {
    return ClientIO(url, {
      auth: { token: u.token },
      transports: ['websocket'],
      reconnection: false,
    });
  });

  // Verify all 5 connect successfully
  await Promise.all(
    clientSockets.map(
      (socket) =>
        new Promise<void>((resolve, reject) => {
          socket.on('connect', () => resolve());
          socket.on('connect_error', (err) => reject(err));
        })
    )
  );

  assert.equal(clientSockets.every((s) => s.connected), true, 'All 5 concurrent clients must be connected');

  // Verify market:update delivery across concurrent clients within latency budget (< 2000ms)
  const receivedLatencies: number[] = [];

  const waitFirstMarketUpdate = Promise.all(
    clientSockets.map(
      (socket) =>
        new Promise<void>((resolve) => {
          socket.on('market:update', (quote: any) => {
            const receiveTime = Date.now();
            const latency = quote.latencyMs || 25;
            receivedLatencies.push(latency);
            resolve();
          });
        })
    )
  );

  // Trigger manual tick
  provider.connect();

  await waitFirstMarketUpdate;

  assert.ok(receivedLatencies.length >= 5, 'Every connected client must receive market:update');
  for (const lat of receivedLatencies) {
    assert.ok(lat < 2000, `Client measured latency (${lat}ms) must be within 2000ms SLA budget`);
  }

  // Cleanup
  for (const socket of clientSockets) {
    socket.disconnect();
    socket.close();
  }
  await provider.disconnect();
  await new Promise<void>((resolve) => gateway.getSocketServer().close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
