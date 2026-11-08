import test from 'node:test';
import assert from 'node:assert/strict';
import { learningService, LEARNING_CURRICULUM } from '../src/modules/education/learningService.js';
import { db } from '../src/db/index.js';

test('Learning Companion: Curriculum Structure and Topic Completeness', () => {
  const topics = learningService.getAllTopics();
  assert.ok(topics.length >= 6, 'Must provide at least 6 structured educational topics');

  for (const t of topics) {
    assert.ok(t.id, 'Topic must have ID');
    assert.ok(t.title, 'Topic must have title');
    assert.ok(t.whatItMeans, 'Topic must define what it means');
    assert.ok(t.whyItIsUsed, 'Topic must define why it is used');
    assert.ok(t.howToInterpret.length > 0, 'Topic must have interpretation guidelines');
    assert.ok(t.simpleExample, 'Topic must have simple example');
    assert.ok(t.importantLimitations.length > 0, 'Topic must document limitations and risks');
    assert.ok(t.keyTakeaway, 'Topic must have key takeaway');
  }

  // Verify specific core topics
  const rsiTopic = learningService.getTopicById('rsi-momentum');
  assert.ok(rsiTopic, 'RSI topic must exist');
  assert.equal(rsiTopic?.category, 'TECHNICAL_INDICATORS');

  const riskTopic = learningService.getTopicById('forecast-uncertainty-and-risk');
  assert.ok(riskTopic, 'Risk & uncertainty topic must exist');
  assert.equal(riskTopic?.category, 'QUANT_AND_RISK');
});

test('Learning Companion: Contextual Click-to-Learn Indicator Education', async () => {
  await db.init();

  // Test standalone RSI definition
  const rsiDef = learningService.getIndicatorEducation('RSI');
  assert.equal(rsiDef.name, 'Relative Strength Index (RSI)');
  assert.ok(rsiDef.whatItMeans.includes('momentum oscillator'));
  assert.ok(rsiDef.howToInterpret.some(h => h.includes('70')));

  // Test MACD definition
  const macdDef = learningService.getIndicatorEducation('MACD');
  assert.equal(macdDef.name, 'Moving Average Convergence Divergence (MACD)');
  assert.ok(macdDef.howToInterpret.some(h => h.includes('Histogram')));

  // Test live contextual stock enrichment for RELIANCE
  const enriched = learningService.getIndicatorEducation('RSI', 'RELIANCE', 'NSE');
  assert.ok(enriched.currentStockContext, 'Should enrich with live stock context if instrument exists');
  assert.equal(enriched.currentStockContext?.symbol, 'RELIANCE');
  assert.ok(enriched.currentStockContext?.currentValue, 'Should have formatted value');
  assert.ok(enriched.currentStockContext?.interpretation, 'Should have contextual interpretation');
});

test('Learning Companion: Progress Tracking Persistence', async () => {
  await db.init();
  const testUserId = 'usr-test-learner-1';

  // Record completion
  const record = await db.saveLearningProgress(testUserId, 'rsi-momentum', true, 95);
  assert.equal(record.user_id, testUserId);
  assert.equal(record.topic_id, 'rsi-momentum');
  assert.equal(record.completed, true);
  assert.equal(record.quiz_score, 95);

  const userProgress = await db.getUserLearningProgress(testUserId);
  assert.ok(userProgress.length >= 1);
  assert.equal(userProgress[0].topic_id, 'rsi-momentum');
});
