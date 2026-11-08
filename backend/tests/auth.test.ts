import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import express from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../src/db/index.js';
import { config, validateProductionSecrets, DEV_JWT_ACCESS_FALLBACK, DEV_JWT_REFRESH_FALLBACK } from '../src/config/index.js';
import { TokenService } from '../src/modules/auth/tokenService.js';
import { loginRateLimiter } from '../src/modules/auth/rateLimiter.js';
import { authRouter } from '../src/modules/auth/authRouter.js';

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

  try {
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
  } finally {
    // Restore state: clean up dummy user and tokens
    db.store.users = db.store.users.filter(u => u.id !== userId);
    db.store.refresh_tokens = db.store.refresh_tokens.filter(t => t.user_id !== userId);
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

function mockLoginRequest(body: any): Promise<{
  status: number;
  body: any;
  cookies: Record<string, { val: any; options: any }>;
}> {
  return new Promise((resolve) => {
    let statusCode = 200;
    let responseBody: any = null;
    const cookies: Record<string, { val: any; options: any }> = {};

    const req: any = {
      method: 'POST',
      url: '/login',
      body,
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      cookies: {},
    };

    const res: any = {
      status(code: number) {
        statusCode = code;
        return res;
      },
      json(data: any) {
        responseBody = data;
        resolve({ status: statusCode, body: responseBody, cookies });
        return res;
      },
      cookie(name: string, val: any, options: any) {
        cookies[name] = { val, options };
        return res;
      },
    };

    authRouter(req, res, () => {
      resolve({ status: 404, body: null, cookies });
    });
  });
}

test('Authentication: Production Security Guard rejects demo account login with DEMO_DISABLED', async () => {
  const originalIsProduction = config.isProduction;
  try {
    (config as any).isProduction = true;

    // 1. Attempt login with demo account
    const demoRes = await mockLoginRequest({
      email: 'demo@marketpulse.ai',
      password: 'DemoPassword123!',
    });

    assert.equal(demoRes.status, 401, 'Demo account must be rejected with 401 in production');
    assert.equal(demoRes.body.code, 'DEMO_DISABLED', 'Error code must be DEMO_DISABLED');
    assert.equal(demoRes.body.error, 'Demo account is disabled in production environments.');

    // 2. Case-insensitive check
    const demoUpperRes = await mockLoginRequest({
      email: 'DEMO@MARKETPULSE.AI',
      password: 'DemoPassword123!',
    });
    assert.equal(demoUpperRes.status, 401);
    assert.equal(demoUpperRes.body.code, 'DEMO_DISABLED');

    // 3. Other user attempt should NOT be blocked by DEMO_DISABLED
    const regularRes = await mockLoginRequest({
      email: 'regular_trader@marketpulse.ai',
      password: 'SomePassword123!',
    });

    assert.notEqual(regularRes.body.code, 'DEMO_DISABLED', 'Non-demo user must not receive DEMO_DISABLED');
  } finally {
    (config as any).isProduction = originalIsProduction;
  }
});

test('Authentication: Non-demo user authenticates successfully in production (unaffected by demo guard)', async () => {
  await db.init();
  const validPassword = 'ValidTraderPass2026!';
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(validPassword, salt);
  const testUserId = 'usr-prod-regular-test';
  const testEmail = 'valid_trader_prod@marketpulse.ai';

  // Ensure test user exists in db store with valid bcrypt hash
  const existing = db.store.users.find(u => u.email === testEmail);
  if (!existing) {
    db.store.users.push({
      id: testUserId,
      email: testEmail,
      password_hash: passwordHash,
      display_name: 'Production Regular Trader',
      role: 'user',
      email_verified: true,
      created_at: new Date().toISOString(),
      last_login_at: new Date().toISOString(),
    });
  } else {
    existing.password_hash = passwordHash;
  }

  const originalIsProduction = config.isProduction;
  try {
    // Run under production mode
    (config as any).isProduction = true;

    const res = await mockLoginRequest({
      email: testEmail,
      password: validPassword,
    });

    // Assert HTTP status is exactly 200
    assert.equal(res.status, 200, 'Non-demo user must authenticate with HTTP 200 in production');
    assert.notEqual(res.body.code, 'DEMO_DISABLED', 'Production demo protection must not affect normal users');
    assert.equal(res.body.message, 'Login successful');

    // Assert access token is returned
    assert.ok(res.body.accessToken && typeof res.body.accessToken === 'string', 'Valid access token must be returned');
    assert.equal(res.body.user.email, testEmail);

    // Assert refresh token cookie is set
    assert.ok(res.cookies.refreshToken && res.cookies.refreshToken.val, 'Refresh token cookie must be set');
    assert.equal(res.cookies.refreshToken.options.httpOnly, true, 'Refresh token cookie must be httpOnly');
  } finally {
    (config as any).isProduction = originalIsProduction;
    // Clean up test user and refresh tokens to ensure strict test isolation
    db.store.users = db.store.users.filter(u => u.id !== testUserId && u.email !== testEmail);
    db.store.refresh_tokens = db.store.refresh_tokens.filter(t => t.user_id !== testUserId);
  }
});

test('Authentication: Development environment permits demo account authentication', async () => {
  await db.init();

  const demoEmail = 'demo@marketpulse.ai';
  let demoUser = db.store.users.find(u => u.email === demoEmail);
  const existedBefore = Boolean(demoUser);

  if (!demoUser) {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('DemoPassword123!', salt);
    demoUser = {
      id: 'usr-demo-001',
      email: demoEmail,
      password_hash: passwordHash,
      display_name: 'Demo Trader',
      role: 'admin',
      email_verified: true,
      created_at: new Date().toISOString(),
      last_login_at: new Date().toISOString(),
    };
    db.store.users.push(demoUser);
  }

  const originalIsProduction = config.isProduction;
  try {
    (config as any).isProduction = false;

    // In development mode, demo login must authenticate successfully
    const demoRes = await mockLoginRequest({
      email: demoEmail,
      password: 'DemoPassword123!',
    });

    // 1. Assert HTTP status is exactly 200
    assert.equal(demoRes.status, 200, 'Development demo login must return HTTP status exactly 200');
    assert.notEqual(demoRes.body.code, 'DEMO_DISABLED', 'Demo login must not be disabled in development');
    assert.equal(demoRes.body.message, 'Login successful');

    // 2. Assert an access token is returned
    assert.ok(demoRes.body.accessToken && typeof demoRes.body.accessToken === 'string', 'Access token must be returned');

    // 3. Assert refresh token cookie and expected successful authentication response are returned
    assert.ok(demoRes.cookies.refreshToken && demoRes.cookies.refreshToken.val, 'Refresh token must be returned in cookies');
    assert.equal(demoRes.cookies.refreshToken.options.httpOnly, true, 'Refresh token cookie must be httpOnly');
    assert.equal(demoRes.body.user.email, demoEmail);
    assert.equal(demoRes.body.user.role, 'admin');
  } finally {
    (config as any).isProduction = originalIsProduction;
    if (!existedBefore) {
      db.store.users = db.store.users.filter(u => u.email !== demoEmail);
    }
    if (demoUser?.id) {
      db.store.refresh_tokens = db.store.refresh_tokens.filter(t => t.user_id !== demoUser.id);
    }
  }
});

test('Security Configuration: Production startup fails safely when required secrets are missing or default', () => {
  // 1. Missing access secret in production throws safe error
  assert.throws(
    () => {
      validateProductionSecrets({
        isProduction: true,
        jwtAccessSecret: '',
        jwtRefreshSecret: 'prod-secure-refresh-key-at-least-32-chars',
      });
    },
    (err: Error) => {
      assert.ok(err.message.includes('Production startup aborted'));
      assert.ok(err.message.includes('JWT_ACCESS_SECRET'));
      // Ensure no credentials or placeholders leak
      assert.ok(!err.message.includes('prod-secure-refresh-key'));
      return true;
    },
    'Should throw error naming JWT_ACCESS_SECRET when missing in production'
  );

  // 2. Fallback access secret in production throws safe error
  assert.throws(
    () => {
      validateProductionSecrets({
        isProduction: true,
        jwtAccessSecret: DEV_JWT_ACCESS_FALLBACK,
        jwtRefreshSecret: 'prod-secure-refresh-key-at-least-32-chars',
      });
    },
    (err: Error) => {
      assert.ok(err.message.includes('JWT_ACCESS_SECRET'));
      return true;
    },
    'Should throw error when access secret uses development fallback in production'
  );

  // 3. Fallback refresh secret in production throws safe error
  assert.throws(
    () => {
      validateProductionSecrets({
        isProduction: true,
        jwtAccessSecret: 'prod-secure-access-key-at-least-32-chars',
        jwtRefreshSecret: DEV_JWT_REFRESH_FALLBACK,
      });
    },
    (err: Error) => {
      assert.ok(err.message.includes('JWT_REFRESH_SECRET'));
      return true;
    },
    'Should throw error when refresh secret uses development fallback in production'
  );

  // 4. Valid production secrets pass successfully
  assert.doesNotThrow(() => {
    validateProductionSecrets({
      isProduction: true,
      jwtAccessSecret: 'prod-custom-secure-access-key-2026',
      jwtRefreshSecret: 'prod-custom-secure-refresh-key-2026',
    });
  }, 'Valid dedicated production secrets must pass verification');

  // 5. Development mode permits development fallbacks
  assert.doesNotThrow(() => {
    validateProductionSecrets({
      isProduction: false,
      jwtAccessSecret: DEV_JWT_ACCESS_FALLBACK,
      jwtRefreshSecret: DEV_JWT_REFRESH_FALLBACK,
    });
  }, 'Development mode must permit default fallback secrets');
});
