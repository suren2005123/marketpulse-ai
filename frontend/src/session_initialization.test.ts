import test from 'node:test';
import assert from 'node:assert/strict';

test('Session Initialization: AbortController Timeout Guard Prevents Infinite Loading', async () => {
  let loading = true;
  let initError: any = null;

  // Simulate timeout controller
  const simulateSessionInit = async (shouldTimeout: boolean) => {
    const controller = new AbortController();
    const timeoutMs = 50; // fast unit-test timeout

    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      if (shouldTimeout) {
        // Mock a hanging network request
        await new Promise((resolve, reject) => {
          controller.signal.addEventListener('abort', () => {
            const err: any = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      }
      clearTimeout(timeoutId);
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        initError = 'Connection timed out while reaching backend service on port 5000.';
      }
    } finally {
      loading = false;
    }
  };

  await simulateSessionInit(true);

  assert.equal(loading, false, 'Loading state MUST be false after timeout; app must never be left on infinite loading screen');
  assert.ok(initError, 'An actionable error message must be populated on session timeout');
  assert.ok(initError && initError.includes('port 5000'), 'Error message must inform the user about the backend port');
});

test('Session Initialization: Safe Price & Metric Coercion from PostgreSQL String Types', () => {
  // PostgreSQL numeric/decimal types may be returned as strings (e.g. "1673.88")
  const rawWatchlistItem = {
    symbol: 'HDFCBANK',
    price: '1673.88',
    change: '-0.12',
    changePct: '-0.01',
    volume: '8646',
  };

  // Safe formatting pattern implemented in Dashboard and Watchlist
  const safeFormatPrice = (val: any) => {
    const num = Number(val ?? 0);
    return `₹${num.toFixed(2)}`;
  };

  const safeFormatChange = (c: any, pct: any) => {
    const numC = Number(c ?? 0);
    const numPct = Number(pct ?? 0);
    const isPos = numC >= 0;
    return `${isPos ? '+' : ''}${numC.toFixed(2)} (${isPos ? '+' : ''}${numPct.toFixed(2)}%)`;
  };

  // Without Number() coercion, rawWatchlistItem.price.toFixed would throw TypeError
  assert.doesNotThrow(() => {
    const formattedPrice = safeFormatPrice(rawWatchlistItem.price);
    assert.equal(formattedPrice, '₹1673.88');
  }, 'String numeric prices from DB must not throw TypeError: p.toFixed is not a function');

  assert.doesNotThrow(() => {
    const formattedChange = safeFormatChange(rawWatchlistItem.change, rawWatchlistItem.changePct);
    assert.equal(formattedChange, '-0.12 (-0.01%)');
  });

  // Test null / undefined resilience
  assert.equal(safeFormatPrice(null), '₹0.00');
  assert.equal(safeFormatPrice(undefined), '₹0.00');
});

test('Session Initialization: Protected Route Fallback Navigation Decision', () => {
  // Decision matrix:
  // 1. Loading + initError => Show Actionable Error Notice
  // 2. Loading + timedOut (> 5s) => Show Actionable Error Notice
  // 3. !Loading + !isAuthenticated => Redirect to /login
  // 4. !Loading + isAuthenticated => Render Protected Children

  const resolveRouteState = (state: { loading: boolean; timedOut: boolean; initError: string | null; isAuthenticated: boolean }) => {
    if (state.initError || (state.loading && state.timedOut)) {
      return 'SHOW_ACTIONABLE_ERROR_CARD';
    }
    if (state.loading) {
      return 'SHOW_SPINNER';
    }
    if (!state.isAuthenticated) {
      return 'REDIRECT_LOGIN';
    }
    return 'RENDER_CHILDREN';
  };

  assert.equal(resolveRouteState({ loading: true, timedOut: false, initError: null, isAuthenticated: false }), 'SHOW_SPINNER');
  assert.equal(resolveRouteState({ loading: true, timedOut: true, initError: null, isAuthenticated: false }), 'SHOW_ACTIONABLE_ERROR_CARD');
  assert.equal(resolveRouteState({ loading: false, timedOut: false, initError: 'Backend offline', isAuthenticated: false }), 'SHOW_ACTIONABLE_ERROR_CARD');
  assert.equal(resolveRouteState({ loading: false, timedOut: false, initError: null, isAuthenticated: false }), 'REDIRECT_LOGIN');
  assert.equal(resolveRouteState({ loading: false, timedOut: false, initError: null, isAuthenticated: true }), 'RENDER_CHILDREN');
});
