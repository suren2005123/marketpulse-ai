import { Request, Response, NextFunction } from 'express';
import { TokenService, TokenPayload } from '../modules/auth/tokenService.js';

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Authentication required. Missing Bearer token in Authorization header.',
      code: 'UNAUTHENTICATED'
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  const payload = TokenService.verifyAccessToken(token);

  if (!payload) {
    res.status(401).json({
      error: 'Session expired or token invalid. Please refresh token or log in again.',
      code: 'TOKEN_EXPIRED'
    });
    return;
  }

  req.user = payload;
  next();
}

export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const payload = TokenService.verifyAccessToken(token);
    if (payload) {
      req.user = payload;
    }
  }
  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({
      error: 'Forbidden. Administrator privileges required.',
      code: 'FORBIDDEN'
    });
    return;
  }
  next();
}
