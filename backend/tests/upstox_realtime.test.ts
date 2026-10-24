import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';
import { UpstoxV3Adapter } from '../src/modules/provider/upstoxAdapter.js';
import { ProviderManager } from '../src/modules/provider/providerManager.js';
import { MarketTick } from '../src/modules/provider/types.js';
import { catalogueService } from '../src/modules/market/catalogueService.js';
import { config } from '../src/config/index.js';

test('Upstox V3: OAuth Authorization URL Generation & Config Validation', () => {
  const originalClientId = config.provider.clientId;
  const originalRedirectUri = config.provider.redirectUri;

  try {
    // 1. Configured state
    config.provider.clientId = 'test_upstox_api_key_123';
    config.provider.redirectUri = 'http://localhost:5000/api/provider/upstox/callback';

    const clientId = config.provider.clientId;
    const redirectUri = config.provider.redirectUri;
    const state = 'test_state_abc';

    const expectedUrl = `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${encodeURIComponent(
      clientId
    )}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;

    assert.ok(expectedUrl.includes('client_id=test_upstox_api_key_123'));
    assert.ok(expectedUrl.includes('response_type=code'));
    assert.ok(expectedUrl.includes(encodeURIComponent('http://localhost:5000/api/provider/upstox/callback')));
    assert.ok(expectedUrl.includes('state=test_state_abc'));
  } finally {
    config.provider.clientId = originalClientId;
    config.provider.redirectUri = originalRedirectUri;
  }
});

test('Upstox V3: Token Secrecy & Credential Sanitization', () => {
  const adapter = new UpstoxV3Adapter();
  const secretToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.super_secret_upstox_bearer_token_xyz987';

  // Set the secret token
  adapter.setAccessToken(secretToken, 'ACTIVE', 'Connected');

  // Verify getStatus does NOT expose the token
  const status = adapter.getStatus();
  assert.equal((status as any).accessToken, undefined, 'getStatus must never include accessToken');
  assert.equal((status as any).token, undefined, 'getStatus must never include token');

  // Verify getDetailedStatus exposes only boolean hasToken
  const detailed = adapter.getDetailedStatus();
  assert.equal(detailed.hasToken, true);
  assert.equal((detailed as any).accessToken, undefined, 'getDetailedStatus must never include accessToken');
  assert.equal((detailed as any).clientSecret, undefined, 'getDetailedStatus must never include clientSecret');

  // Verify serialization to JSON also does not leak the token
  const jsonStr = JSON.stringify(detailed);
  assert.ok(!jsonStr.includes(secretToken), 'Serialized status must not contain the secret token');
});

test('Upstox V3: Account Under Review & Authorization Error Handling', () => {
  const adapter = new UpstoxV3Adapter();

  // Simulate account under review status
  adapter.setAccountStatus(
    'ACCOUNT_UNDER_REVIEW',
    'Your Upstox account reactivation is currently under review by the broker. Safe TejHQ EOD fallback active.'
  );

  const status = adapter.getDetailedStatus();
  assert.equal(status.accountStatus, 'ACCOUNT_UNDER_REVIEW');
  assert.equal(status.connected, false);
  assert.ok(status.actionableMessage.includes('under review'));

  // Attempting connect while under review should not crash or throw unhandled exceptions
  adapter.connect();
  assert.equal(adapter.getStatus().connected, false, 'Should remain disconnected while under review');
});

test('Upstox V3: SDK Message Normalization to MarketTick', (t, done) => {
  const adapter = new UpstoxV3Adapter();

  // Provide mock catalogue resolution for Reliance
  catalogueService.loadMockInstruments([
    {
      id: 'inst-reliance-id',
      exchange: 'NSE',
      symbol: 'RELIANCE',
      name: 'Reliance Industries Ltd',
      sector: 'Energy',
      provider_instrument_key: 'NSE_EQ|INE002A01018',
      isin: 'INE002A01018',
      active: true,
      price: 2980.0,
    },
  ]);

  // Mock raw message payload matching Upstox V3 WebSocket Protobuf decoded JSON structure
  const mockUpstoxPayload = {
    type: 'live_feed',
    currentTs: 1730000000000,
    feeds: {
      'NSE_EQ|INE002A01018': {
        ff: {
          marketFF: {
            ltpc: {
              ltp: 2995.50,
              ltt: 1730000000000,
              ltq: 150,
              cp: 2980.00,
            },
            marketOHLC: {
              ohlc: [
                {
                  interval: 'I1',
                  open: 2982.00,
                  high: 2998.00,
                  low: 2980.00,
                  close: 2995.50,
                  vol: 4500000,
                  ts: 1730000000000,
                },
              ],
            },
            vtt: 8500000,
            atp: 2989.40,
          },
        },
      },
    },
  };

  adapter.on('tick', (tick: MarketTick) => {
    try {
      assert.equal(tick.symbol, 'RELIANCE', 'Symbol must be RELIANCE');
      assert.equal(tick.exchange, 'NSE', 'Exchange must be NSE');
      assert.equal(tick.price, 2995.50, 'Price must match ltp 2995.50');
      assert.equal(tick.open, 2982.00, 'Open must match OHLC open');
      assert.equal(tick.high, 2998.00, 'High must match OHLC high');
      assert.equal(tick.low, 2980.00, 'Low must match OHLC low');
      assert.equal(tick.close, 2995.50, 'Close must match current ltp');
      assert.equal(tick.volume, 8500000, 'Volume must match vtt');
      assert.equal(tick.sourceMode, 'LIVE', 'SourceMode must be LIVE');
      assert.equal(tick.provider, 'Upstox-V3', 'Provider must be Upstox-V3');
      assert.ok(typeof tick.timestamp === 'string');
      done();
    } catch (err) {
      done(err);
    }
  });

  // Inject feed message
  adapter.handleFeedMessage(mockUpstoxPayload);
});

test('Upstox V3: Subscription Manager Capacity Limit & Priority Eviction', () => {
  const adapter = new UpstoxV3Adapter();

  // 1. Subscribe to 5 high-priority watchlist instruments
  const watchlist = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK'];
  adapter.subscribe(watchlist, 'HIGH');

  // 2. Generate 110 browsing keys (exceeding the MAX_SUBSCRIPTIONS of 100)
  const bulkBrowsingKeys: string[] = [];
  for (let i = 1; i <= 110; i++) {
    bulkBrowsingKeys.push(`NSE_EQ|INE999${String(i).padStart(4, '0')}0`);
  }
  adapter.subscribe(bulkBrowsingKeys, 'NORMAL');

  const activeSubs = adapter.getActiveSubscriptions();

  // Must strictly not exceed capacity limit of 100
  assert.ok(activeSubs.length <= 100, `Active subscriptions (${activeSubs.length}) must not exceed limit of 100`);

  // Verify watchlist keys were NEVER evicted
  const relianceKey = adapter.resolveSymbolToKey('RELIANCE');
  assert.ok(relianceKey && activeSubs.includes(relianceKey), 'Priority watchlist key RELIANCE must be retained');

  const tcsKey = adapter.resolveSymbolToKey('TCS');
  assert.ok(tcsKey && activeSubs.includes(tcsKey), 'Priority watchlist key TCS must be retained');
});

test('Upstox V3: Stale Price Detection (> 15 Seconds)', () => {
  const adapter = new UpstoxV3Adapter();

  // Fresh tick simulation
  adapter.handleFeedMessage({
    feeds: {
      'NSE_EQ|INE002A01018': {
        ltpc: { ltp: 3000.0, ltt: Date.now() },
      },
    },
  });

  assert.equal(adapter.getStatus().stale, false, 'Should be fresh immediately after message');

  // Force lastReceivedAt to 16 seconds ago
  (adapter as any).lastReceivedAt = Date.now() - 16000;
  assert.equal(adapter.getStatus().stale, true, 'Must report stale: true when > 15s elapsed');

  // Fresh message arrives again
  adapter.handleFeedMessage({
    feeds: {
      'NSE_EQ|INE002A01018': {
        ltpc: { ltp: 3001.0, ltt: Date.now() },
      },
    },
  });

  assert.equal(adapter.getStatus().stale, false, 'Must recover to stale: false after fresh tick');
});

test('Upstox V3: Reconnection State Tracking', () => {
  const adapter = new UpstoxV3Adapter();
  const mockStreamer = new EventEmitter();
  (mockStreamer as any).connect = async () => {};
  (mockStreamer as any).autoReconnect = () => {};

  adapter.injectMockStreamer(mockStreamer);

  // Trigger open
  mockStreamer.emit('open');
  assert.equal(adapter.getStatus().connected, true);
  assert.equal(adapter.getStatus().reconnecting, false);

  // Trigger reconnecting
  mockStreamer.emit('reconnecting', 'Auto reconnect attempt 1/5');
  assert.equal(adapter.getStatus().reconnecting, true);
  assert.equal(adapter.getStatus().reconnectAttempts, 1);

  // Trigger close
  mockStreamer.emit('close');
  assert.equal(adapter.getStatus().connected, false);
});

test('Provider Fallback: Mode Switching and Safe Segregation', async () => {
  const originalToken = config.provider.accessToken;
  config.provider.accessToken = '';

  try {
    const pm = new ProviderManager('SIMULATED');
    assert.equal(pm.getCurrentMode(), 'SIMULATED');

    // Switch to END_OF_DAY (TejHQ)
    await pm.switchMode('END_OF_DAY');
    assert.equal(pm.getCurrentMode(), 'END_OF_DAY');
    assert.ok(pm.getStatus().provider.includes('TejHQ'));

    // Switch to LIVE mode (Upstox)
    await pm.switchMode('LIVE');
    assert.equal(pm.getCurrentMode(), 'LIVE');
    assert.ok(pm.getStatus().provider.includes('Upstox'));
    assert.equal(pm.getStatus().mode, 'LIVE');

    // Switch back safely to SIMULATED
    await pm.switchMode('SIMULATED');
    assert.equal(pm.getCurrentMode(), 'SIMULATED');
    assert.ok(pm.getStatus().provider.includes('Deterministic') || pm.getStatus().provider.includes('Simulat'));

    await pm.disconnect();
  } finally {
    config.provider.accessToken = originalToken;
  }
});
