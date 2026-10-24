import { Router, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db/index.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/authMiddleware.js';

export const alertsRouter = Router();

// Require authentication for all alerts routes
alertsRouter.use('/alerts', authenticateToken);

const createAlertSchema = z.object({
  instrumentId: z.string().min(1, 'Instrument ID is required'),
  conditionType: z.enum([
    'PRICE_ABOVE',
    'PRICE_BELOW',
    'PCT_CHANGE_ABOVE',
    'VOLUME_SPIKE',
    'UNCERTAINTY_WIDE',
    'FEED_STALE',
  ]),
  threshold: z.number().positive('Threshold must be a positive number'),
});

const updateAlertSchema = z.object({
  active: z.boolean().optional(),
  threshold: z.number().positive().optional(),
});

// GET /api/alerts
alertsRouter.get('/alerts', (req: AuthenticatedRequest, res: Response): void => {
  try {
    const userId = req.user!.userId;
    const userAlerts = db.store.price_alerts.filter(a => a.user_id === userId);

    const enriched = userAlerts.map(a => {
      const inst = db.store.instruments.find(i => i.id === a.instrument_id);
      return {
        id: a.id,
        instrumentId: a.instrument_id,
        symbol: inst?.symbol || 'UNKNOWN',
        exchange: inst?.exchange || 'NSE',
        name: inst?.name || '',
        conditionType: a.condition_type,
        threshold: a.threshold,
        active: a.active,
        triggeredAt: a.triggered_at,
        createdAt: a.created_at,
      };
    });

    res.json({
      success: true,
      count: enriched.length,
      data: enriched,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve alerts' });
  }
});

// POST /api/alerts
alertsRouter.post('/alerts', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const parse = createAlertSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parse.error.flatten().fieldErrors,
      });
      return;
    }

    const { instrumentId, conditionType, threshold } = parse.data;

    const inst = db.store.instruments.find(i => i.id === instrumentId || i.symbol.toUpperCase() === instrumentId.toUpperCase());
    if (!inst) {
      res.status(404).json({ error: 'Instrument not found' });
      return;
    }

    const newAlert = {
      id: `alert-${crypto.randomUUID().slice(0, 8)}`,
      user_id: userId,
      instrument_id: inst.id,
      condition_type: conditionType,
      threshold,
      active: true,
      triggered_at: null,
      created_at: new Date().toISOString(),
    };

    await db.insertAlert(newAlert);

    res.status(201).json({
      success: true,
      message: 'Price alert created successfully',
      data: {
        ...newAlert,
        symbol: inst.symbol,
        exchange: inst.exchange,
        name: inst.name,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create alert' });
  }
});

// PATCH /api/alerts/:id
alertsRouter.patch('/alerts/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const alert = db.store.price_alerts.find(a => a.id === id);
    if (!alert) {
      res.status(404).json({ error: 'Alert not found', code: 'ALERT_NOT_FOUND' });
      return;
    }

    // STRICT CROSS-USER PROTECTION: Must return 403 Forbidden if not the owner!
    if (alert.user_id !== userId) {
      res.status(403).json({
        error: 'Forbidden. You do not have permission to modify another user’s alert.',
        code: 'FORBIDDEN_RESOURCE_OWNERSHIP',
      });
      return;
    }

    const parse = updateAlertSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: 'Invalid update payload', details: parse.error.flatten() });
      return;
    }

    const updates: { active?: boolean; threshold?: number } = {};
    if (parse.data.active !== undefined) updates.active = parse.data.active;
    if (parse.data.threshold !== undefined) updates.threshold = parse.data.threshold;

    await db.updateAlert(id, userId, updates);

    res.json({
      success: true,
      message: 'Alert updated successfully',
      data: alert,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update alert' });
  }
});

// DELETE /api/alerts/:id
alertsRouter.delete('/alerts/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const alert = db.store.price_alerts.find(a => a.id === id);
    if (!alert) {
      res.status(404).json({ error: 'Alert not found', code: 'ALERT_NOT_FOUND' });
      return;
    }

    // STRICT CROSS-USER PROTECTION: Must return 403 Forbidden if not the owner!
    if (alert.user_id !== userId) {
      res.status(403).json({
        error: 'Forbidden. You do not have permission to delete another user’s alert.',
        code: 'FORBIDDEN_RESOURCE_OWNERSHIP',
      });
      return;
    }

    await db.deleteAlert(id, userId);

    res.json({
      success: true,
      message: 'Alert deleted successfully',
      deletedId: id,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete alert' });
  }
});
