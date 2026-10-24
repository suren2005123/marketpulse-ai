import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { db } from '../src/db/index.js';
import { TokenService } from '../src/modules/auth/tokenService.js';
import { loginRateLimiter } from '../src/modules/auth/rateLimiter.js';

test('Authentication: Password Hashing and Verification with bcrypt', async () => {
  const plain = 'StrongTraderPass123!';
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(plain, salt);

  assert.notEqual(plain, hash, 'Password hash must not equal plaintext');
  const match = await bcrypt.compare(plain, hash);
  assert.equal(match, true, 'Valid password must verify against hash');

  const falseMatch = await bcrypt.compare('WrongPassword!', hash);
  assert.equal(falseMatch, false, 'Invalid password must be rejected');
});

test('Authentication: JWT Access Token and Expiration Validation', async () => {
  const payload = { userId: 'usr-test-123', email: 'test@marketpulse.ai', role: 'user' };
  const token = TokenService.generateAccessToken(payload);

  assert.ok(typeof token === 'string' && token.length > 20, 'Token must be a valid JWT string');
  
  const decoded = TokenService.verifyAccessToken(token);
  assert.ok(decoded, 'Token must decode successfully');
  assert.equal(decoded?.userId, payload.userId);
  assert.equal(decoded?.email, payload.email);

  const invalidDecoded = TokenService.verifyAccessToken('invalid.jwt.token');
  assert.equal(invalidDecoded, null, 'Invalid token must return null');
});

test('Authentication: Refresh Token Rotation and Reuse Detection', async () => {
  await db.init();
  const userId = 'usr-test-rotation';

  // 1. Create first refresh token
  const initialToken = await TokenService.createRefreshToken(userId);
  assert.ok(initialToken, 'Refresh token must be created');

  // Add dummy user in db
  db.store.users.push({
    id: userId,
    email: 'rotate@marketpulse.ai',
    password_hash: 'hash',
    display_name: 'Rotate User',
    role: 'user',
    email_verified: true,
    created_at: new Date().toISOString(),
    last_login_at: new Date().toISOString(),
  });

  // 2. Rotate token
  const rotation1 = await TokenService.rotateRefreshToken(initialToken);
  assert.ok(rotation1, 'Rotation must succeed');
  assert.notEqual(rotation1?.newRefreshToken, initialToken, 'New token must differ from old');
  assert.ok(rotation1?.accessToken, 'New access token must be issued');

  // 3. Reuse Detection: Attempting to use old revoked token again
  const reuseAttempt = await TokenService.rotateRefreshToken(initialToken);
  assert.equal(reuseAttempt, null, 'Reusing revoked token must fail');

  // Check that all tokens for this user were revoked due to reuse detection
  const userTokens = db.store.refresh_tokens.filter(t => t.user_id === userId);
  for (const t of userTokens) {
    assert.ok(t.revoked_at, 'Token must be revoked after reuse breach');
  }
});

test('Authentication: Rate Limiting and Lockout on repeated failed attempts', () => {
  const ip = '192.168.1.100';
  const email = 'lockout@marketpulse.ai';

  loginRateLimiter.reset(ip, email);

  // 4 failed attempts should not lock out (limit is 5)
  for (let i = 1; i <= 4; i++) {
    const res = loginRateLimiter.recordFailedAttempt(ip, email);
    assert.equal(res.locked, false, `Attempt ${i} should not trigger lockout`);
    assert.equal(res.remainingAttempts, 5 - i);
  }

  // 5th failed attempt must trigger lockout!
  const fifthAttempt = loginRateLimiter.recordFailedAttempt(ip, email);
  assert.equal(fifthAttempt.locked, true, '5th attempt must trigger lockout');
  assert.equal(fifthAttempt.remainingAttempts, 0);

  // Subsequent check must report locked
  const lockStatus = loginRateLimiter.isLocked(ip, email);
  assert.equal(lockStatus.locked, true, 'User must remain locked out');
  assert.ok(lockStatus.remainingSeconds > 0);

  // Reset
  loginRateLimiter.reset(ip, email);
  assert.equal(loginRateLimiter.isLocked(ip, email).locked, false);
});
