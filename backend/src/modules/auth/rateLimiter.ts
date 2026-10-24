import { config } from '../../config/index.js';

interface AttemptRecord {
  count: number;
  lockoutUntil: number | null;
}

class LoginRateLimiter {
  private attempts = new Map<string, AttemptRecord>();

  private getKey(ip: string, email: string): string {
    return `${ip}:${email.toLowerCase().trim()}`;
  }

  isLocked(ip: string, email: string): { locked: boolean; remainingSeconds: number } {
    const key = this.getKey(ip, email);
    const record = this.attempts.get(key);
    if (!record || !record.lockoutUntil) {
      return { locked: false, remainingSeconds: 0 };
    }

    const now = Date.now();
    if (now < record.lockoutUntil) {
      const remainingSeconds = Math.ceil((record.lockoutUntil - now) / 1000);
      return { locked: true, remainingSeconds };
    }

    // Lockout expired
    this.attempts.delete(key);
    return { locked: false, remainingSeconds: 0 };
  }

  recordFailedAttempt(ip: string, email: string): { locked: boolean; remainingAttempts: number; remainingSeconds: number } {
    const key = this.getKey(ip, email);
    const record = this.attempts.get(key) || { count: 0, lockoutUntil: null };
    record.count += 1;

    if (record.count >= config.rateLimit.maxAttempts) {
      const lockoutMs = config.rateLimit.lockoutMinutes * 60 * 1000;
      record.lockoutUntil = Date.now() + lockoutMs;
      this.attempts.set(key, record);
      return {
        locked: true,
        remainingAttempts: 0,
        remainingSeconds: config.rateLimit.lockoutMinutes * 60,
      };
    }

    this.attempts.set(key, record);
    return {
      locked: false,
      remainingAttempts: config.rateLimit.maxAttempts - record.count,
      remainingSeconds: 0,
    };
  }

  reset(ip: string, email: string): void {
    const key = this.getKey(ip, email);
    this.attempts.delete(key);
  }
}

export const loginRateLimiter = new LoginRateLimiter();
