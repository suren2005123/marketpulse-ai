import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { db, sanitizeError } from '../src/db/index.js';

test('Database: Health Check Diagnostics and Engine Verification', async () => {
  await db.init();
  const health = await db.checkHealth();

  assert.ok(health.connected, 'Database must report connected');
  assert.ok(['PostgreSQL', 'Embedded Local Storage'].includes(health.engine), 'Engine must be PostgreSQL or Local Storage');
  assert.ok(typeof health.latencyMs === 'number' && health.latencyMs >= 0, 'Latency must be a non-negative number');
  assert.ok(health.tables, 'Health must include table statistics');
  assert.equal(health.error, undefined, 'Healthy database must not report errors');
});

test('Database: Credential Sanitization and Password Protection', () => {
  const sensitiveError = new Error('Connection failed to postgresql://postgres:MySuperSecretPass123!@localhost:5432/marketpulse');
  const sanitized = sanitizeError(sensitiveError);

  assert.equal(
    sanitized.includes('MySuperSecretPass123!'),
    false,
    'Sanitized error message must NEVER contain the plaintext password'
  );
  assert.ok(
    sanitized.includes('***'),
    'Sanitized error message must mask password with asterisks'
  );
});

test('Database: User Registration Hashed Password Security (Zero Plaintext)', async () => {
  const plainPassword = 'TraderSecurePass2026!';
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(plainPassword, salt);

  const testUser = {
    id: 'usr-test-db-secure',
    email: 'db-secure@marketpulse.ai',
    password_hash: passwordHash,
    display_name: 'Secure Trader',
    role: 'user',
    email_verified: true,
  };

  await db.insertUser(testUser);

  // Retrieve user
  const storedUser = db.store.users.find(u => u.id === testUser.id);
  assert.ok(storedUser, 'User must be stored in database');
  assert.notEqual(storedUser.password_hash, plainPassword, 'Database must never store plaintext password');
  assert.ok(storedUser.password_hash.startsWith('$2'), 'Password hash must be a valid bcrypt hash');

  const valid = await bcrypt.compare(plainPassword, storedUser.password_hash);
  assert.equal(valid, true, 'Stored bcrypt hash must verify with original password');

  const invalid = await bcrypt.compare('WrongPassword', storedUser.password_hash);
  assert.equal(invalid, false, 'Stored bcrypt hash must reject incorrect password');
});

test('Database: Watchlist and Alert CRUD Persistence Isolation', async () => {
  const userId = 'usr-test-crud';
  const instId = 'inst-rel';

  // Watchlist
  await db.insertWatchlist(userId, instId);
  const inWatchlist = db.store.user_watchlists.some(w => w.user_id === userId && w.instrument_id === instId);
  assert.equal(inWatchlist, true, 'Watchlist item must be stored');

  await db.removeWatchlist(userId, instId);
  const afterRemove = db.store.user_watchlists.some(w => w.user_id === userId && w.instrument_id === instId);
  assert.equal(afterRemove, false, 'Watchlist item must be deleted');

  // Alert
  const alertId = 'alert-test-crud';
  await db.insertAlert({
    id: alertId,
    user_id: userId,
    instrument_id: instId,
    condition_type: 'PRICE_ABOVE',
    threshold: 3200.00,
    active: true,
    triggered_at: null,
    created_at: new Date().toISOString(),
  });

  const storedAlert = db.store.price_alerts.find(a => a.id === alertId);
  assert.ok(storedAlert, 'Alert must be stored');
  assert.equal(storedAlert.threshold, 3200.00);

  await db.updateAlert(alertId, userId, { active: false, threshold: 3250.00 });
  const updatedAlert = db.store.price_alerts.find(a => a.id === alertId);
  assert.equal(updatedAlert?.active, false, 'Alert active status must update');
  assert.equal(updatedAlert?.threshold, 3250.00, 'Alert threshold must update');

  await db.deleteAlert(alertId, userId);
  const deletedAlert = db.store.price_alerts.find(a => a.id === alertId);
  assert.equal(deletedAlert, undefined, 'Alert must be deleted');
});
