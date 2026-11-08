import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { config } from '../../config/index.js';
import { db } from '../../db/index.js';
import { TokenService } from './tokenService.js';
import { loginRateLimiter } from './rateLimiter.js';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/authMiddleware.js';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email('Please enter a valid email address').trim().toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  displayName: z.string().min(2, 'Display name must be at least 2 characters').max(50),
});

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address').trim().toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

// POST /api/auth/register
authRouter.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      });
      return;
    }

    const { email, password, displayName } = parseResult.data;

    // Check if user already exists
    const existing = db.store.users.find(u => u.email.toLowerCase() === email);
    if (existing) {
      res.status(409).json({
        error: 'An account with this email address already exists. Please log in.',
        code: 'EMAIL_ALREADY_EXISTS',
      });
      return;
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const userId = crypto.randomUUID();
    const newUser = {
      id: userId,
      email,
      password_hash: passwordHash,
      display_name: displayName,
      role: 'user',
      email_verified: true,
      created_at: new Date().toISOString(),
      last_login_at: new Date().toISOString(),
    };

    await db.insertUser(newUser);

    // Issue tokens
    const accessToken = TokenService.generateAccessToken({
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role,
    });
    const refreshToken = await TokenService.createRefreshToken(newUser.id);

    // Set secure httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: config.jwt.cookieSecure,
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      message: 'Account created successfully',
      user: {
        id: newUser.id,
        email: newUser.email,
        displayName: newUser.display_name,
        role: newUser.role,
      },
      accessToken,
    });
  } catch (err: any) {
    console.error('[Register Error]:', err);
    res.status(500).json({ error: 'Internal server error during registration.' });
  }
});

// POST /api/auth/login
authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      });
      return;
    }

    const { email, password } = parseResult.data;
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

    // Production security guard: reject demo credentials in production
    if (config.isProduction && email === 'demo@marketpulse.ai') {
      res.status(401).json({
        error: 'Demo account is disabled in production environments.',
        code: 'DEMO_DISABLED',
      });
      return;
    }

    // Rate limiting check
    const lockStatus = loginRateLimiter.isLocked(clientIp, email);
    if (lockStatus.locked) {
      res.status(429).json({
        error: `Account locked due to multiple failed attempts. Please try again in ${lockStatus.remainingSeconds} seconds.`,
        code: 'ACCOUNT_LOCKED',
        retryAfter: lockStatus.remainingSeconds,
      });
      return;
    }

    // Find user
    const user = db.store.users.find(u => u.email.toLowerCase() === email);
    if (!user) {
      const failed = loginRateLimiter.recordFailedAttempt(clientIp, email);
      res.status(401).json({
        error: 'Invalid email or password.',
        code: 'INVALID_CREDENTIALS',
        remainingAttempts: failed.remainingAttempts,
      });
      return;
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      const failed = loginRateLimiter.recordFailedAttempt(clientIp, email);
      res.status(401).json({
        error: 'Invalid email or password.',
        code: 'INVALID_CREDENTIALS',
        remainingAttempts: failed.remainingAttempts,
      });
      return;
    }

    // Login successful: reset rate limiter
    loginRateLimiter.reset(clientIp, email);
    await db.updateUserLastLogin(user.id);

    // Issue tokens
    const accessToken = TokenService.generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });
    const refreshToken = await TokenService.createRefreshToken(user.id);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: config.jwt.cookieSecure,
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
      },
      accessToken,
    });
  } catch (err: any) {
    console.error('[Login Error]:', err);
    res.status(500).json({ error: 'Internal server error during login.' });
  }
});

// POST /api/auth/refresh
authRouter.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const rawRefreshToken = req.cookies?.refreshToken;
    if (!rawRefreshToken) {
      res.status(401).json({
        error: 'Refresh token missing in request cookies.',
        code: 'NO_REFRESH_TOKEN',
      });
      return;
    }

    const rotationResult = await TokenService.rotateRefreshToken(rawRefreshToken);
    if (!rotationResult) {
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: config.jwt.cookieSecure,
        sameSite: 'strict',
      });
      res.status(401).json({
        error: 'Invalid or revoked refresh token. Please log in again.',
        code: 'INVALID_REFRESH_TOKEN',
      });
      return;
    }

    // Set new rotated refresh cookie
    res.cookie('refreshToken', rotationResult.newRefreshToken, {
      httpOnly: true,
      secure: config.jwt.cookieSecure,
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      accessToken: rotationResult.accessToken,
      user: rotationResult.user,
    });
  } catch (err: any) {
    console.error('[Refresh Error]:', err);
    res.status(500).json({ error: 'Internal server error during token refresh.' });
  }
});

// POST /api/auth/logout
authRouter.post('/logout', async (req: Request, res: Response): Promise<void> => {
  try {
    const rawRefreshToken = req.cookies?.refreshToken;
    if (rawRefreshToken) {
      await TokenService.revokeRefreshToken(rawRefreshToken);
    }

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: config.jwt.cookieSecure,
      sameSite: 'strict',
    });

    res.status(200).json({ message: 'Logged out successfully.' });
  } catch (err: any) {
    console.error('[Logout Error]:', err);
    res.status(500).json({ error: 'Internal server error during logout.' });
  }
});

// GET /api/auth/me
authRouter.get('/me', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = db.store.users.find(u => u.id === req.user?.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found.', code: 'USER_NOT_FOUND' });
      return;
    }

    res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at,
      },
    });
  } catch (err: any) {
    console.error('[Me Error]:', err);
    res.status(500).json({ error: 'Internal server error fetching user.' });
  }
});
