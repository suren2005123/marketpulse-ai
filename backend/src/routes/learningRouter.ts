import { Router, Request, Response } from 'express';
import { learningService } from '../modules/education/learningService.js';
import { db } from '../db/index.js';
import { TokenService } from '../modules/auth/tokenService.js';

export const learningRouter = Router();

function getUserId(req: Request): string {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    const payload = TokenService.verifyAccessToken(token);
    if (payload?.userId) return payload.userId;
  }
  return 'usr-demo-001';
}

// GET /api/learn/topics
learningRouter.get('/learn/topics', (req: Request, res: Response): void => {
  try {
    const topics = learningService.getAllTopics();
    const userId = getUserId(req);
    const progressList = db.store.learning_progress?.filter(p => p.user_id === userId) || [];
    const completedMap = new Set(progressList.filter(p => p.completed).map(p => p.topic_id));

    const enriched = topics.map(t => ({
      ...t,
      completed: completedMap.has(t.id),
    }));

    res.json({
      success: true,
      count: enriched.length,
      data: enriched,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve learning topics' });
  }
});

// GET /api/learn/topics/:topicId
learningRouter.get('/learn/topics/:topicId', (req: Request, res: Response): void => {
  try {
    const topic = learningService.getTopicById(req.params.topicId);
    if (!topic) {
      res.status(404).json({ error: `Topic ${req.params.topicId} not found.` });
      return;
    }
    res.json({
      success: true,
      data: topic,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve learning topic' });
  }
});

// GET /api/learn/explain-indicator
learningRouter.get('/learn/explain-indicator', (req: Request, res: Response): void => {
  try {
    const indicator = String(req.query.indicator || req.query.key || 'RSI');
    const symbol = req.query.symbol ? String(req.query.symbol) : undefined;
    const exchange = req.query.exchange ? String(req.query.exchange) : 'NSE';

    const info = learningService.getIndicatorEducation(indicator, symbol, exchange);
    res.json({
      success: true,
      data: info,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve indicator education' });
  }
});

// POST /api/learn/progress
learningRouter.post('/learn/progress', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const { topicId, completed = true, quizScore } = req.body;

    if (!topicId) {
      res.status(400).json({ error: 'topicId is required' });
      return;
    }

    const saved = await db.saveLearningProgress(userId, topicId, Boolean(completed), quizScore);
    res.json({
      success: true,
      data: saved,
      message: 'Learning progress recorded successfully.',
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to record learning progress' });
  }
});

// GET /api/learn/progress
learningRouter.get('/learn/progress', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const progress = await db.getUserLearningProgress(userId);
    res.json({
      success: true,
      data: progress,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve user learning progress' });
  }
});
