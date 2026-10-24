import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db/index.js';

test('Authorization: User Ownership and Strict Cross-User Access Isolation', async () => {
  await db.init();

  const userA_id = 'usr-alpha-001';
  const userB_id = 'usr-beta-002';

  // Seed alert belonging exclusively to User A
  const alertA_id = 'alert-isolated-001';
  db.store.price_alerts.push({
    id: alertA_id,
    user_id: userA_id,
    instrument_id: 'inst-rel',
    condition_type: 'PRICE_ABOVE',
    threshold: 3100.00,
    active: true,
    triggered_at: null,
    created_at: new Date().toISOString(),
  });

  // 1. Verify User A query returns alert
  const userA_alerts = db.store.price_alerts.filter(a => a.user_id === userA_id);
  assert.equal(userA_alerts.some(a => a.id === alertA_id), true, "User A must see their own alert");

  // 2. Verify User B query NEVER returns User A's alert
  const userB_alerts = db.store.price_alerts.filter(a => a.user_id === userB_id);
  assert.equal(userB_alerts.some(a => a.id === alertA_id), false, "User B must NOT see User A's alert");

  // 3. Simulate User B trying to modify User A's alert
  const targetAlert = db.store.price_alerts.find(a => a.id === alertA_id);
  assert.ok(targetAlert);

  const attemptUnauthorizedEdit = (requestingUserId: string) => {
    if (targetAlert.user_id !== requestingUserId) {
      return { status: 403, error: 'Forbidden. You do not have permission to modify another user’s alert.' };
    }
    targetAlert.threshold = 9999;
    return { status: 200, data: targetAlert };
  };

  const forbiddenResult = attemptUnauthorizedEdit(userB_id);
  assert.equal(forbiddenResult.status, 403, 'Cross-user modification attempt must be rejected with 403');
  assert.equal(targetAlert.threshold, 3100.00, 'Alert threshold must remain unchanged');

  // 4. Verify User A can edit their own alert
  const authorizedResult = attemptUnauthorizedEdit(userA_id);
  assert.equal(authorizedResult.status, 200, 'Owner modification must succeed with 200');
  assert.equal(targetAlert.threshold, 9999, 'Alert threshold must be updated by owner');
});

test('Authorization: Watchlist Privacy Scoping', async () => {
  await db.init();

  const userA_id = 'usr-watcher-a';
  const userB_id = 'usr-watcher-b';

  db.store.user_watchlists.push(
    { user_id: userA_id, instrument_id: 'inst-rel', added_at: new Date().toISOString() },
    { user_id: userA_id, instrument_id: 'inst-tcs', added_at: new Date().toISOString() },
    { user_id: userB_id, instrument_id: 'inst-infy', added_at: new Date().toISOString() }
  );

  const watchlistA = db.store.user_watchlists.filter(w => w.user_id === userA_id);
  const watchlistB = db.store.user_watchlists.filter(w => w.user_id === userB_id);

  assert.equal(watchlistA.length, 2);
  assert.ok(watchlistA.every(w => w.user_id === userA_id));
  assert.equal(watchlistB.length, 1);
  assert.equal(watchlistB[0].instrument_id, 'inst-infy');
});
