import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../../config/index.js';
import { db } from '../../db/index.js';

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

export class TokenService {
  static generateAccessToken(payload: TokenPayload): string {
    return jwt.sign(payload, config.jwt.accessSecret, {
      expiresIn: config.jwt.accessExpiresIn as any,
    });
  }

  static verifyAccessToken(token: string): TokenPayload | null {
    try {
      return jwt.verify(token, config.jwt.accessSecret) as TokenPayload;
    } catch (err) {
      return null;
    }
  }

  static async createRefreshToken(userId: string): Promise<string> {
    const rawToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    const id = crypto.randomUUID();
    const tokenRecord = {
      id,
      user_id: userId,
      token_hash: tokenHash,
      issued_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      revoked_at: null,
      replaced_by_token_id: null,
    };
    await db.insertRefreshToken(tokenRecord);

    return rawToken;
  }

  static async rotateRefreshToken(rawToken: string): Promise<{ accessToken: string; newRefreshToken: string; user: any } | null> {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const tokenRecord = db.store.refresh_tokens.find(t => t.token_hash === tokenHash);

    if (!tokenRecord) {
      return null;
    }

    // Reuse detection: If token was already revoked, revoke all tokens for this user!
    if (tokenRecord.revoked_at) {
      console.warn(`[Security Alert] Refresh token reuse detected for user ${tokenRecord.user_id}. Revoking all sessions.`);
      await db.revokeAllUserTokens(tokenRecord.user_id);
      return null;
    }

    // Check expiration
    if (new Date(tokenRecord.expires_at) < new Date()) {
      await db.revokeRefreshToken(tokenHash);
      return null;
    }

    // Find user
    const user = db.store.users.find(u => u.id === tokenRecord.user_id);
    if (!user) {
      return null;
    }

    // Create new refresh token
    const newRawToken = crypto.randomBytes(40).toString('hex');
    const newTokenHash = crypto.createHash('sha256').update(newRawToken).digest('hex');
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + 30);

    const newId = crypto.randomUUID();
    await db.insertRefreshToken({
      id: newId,
      user_id: user.id,
      token_hash: newTokenHash,
      issued_at: new Date().toISOString(),
      expires_at: newExpiresAt.toISOString(),
      revoked_at: null,
      replaced_by_token_id: null,
    });

    // Invalidate old token and link
    await db.revokeRefreshToken(tokenRecord.token_hash, newId);

    // Generate new access token
    const accessToken = this.generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      newRefreshToken: newRawToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
      },
    };
  }

  static async revokeRefreshToken(rawToken: string): Promise<boolean> {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const tokenRecord = db.store.refresh_tokens.find(t => t.token_hash === tokenHash);
    if (tokenRecord) {
      await db.revokeRefreshToken(tokenHash);
      return true;
    }
    return false;
  }
}
