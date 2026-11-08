import test from 'node:test';
import assert from 'node:assert/strict';
import { stockExplanationService } from '../src/modules/analysis/stockExplanationService.js';
import { db } from '../src/db/index.js';

test('Explain My Stock: Grounded Facts vs Interpretations Separation', async () => {
  await db.init();

  // Synthetic 30 candles
  const candles: any[] = [];
  let price = 2950;
  for (let i = 0; i < 30; i++) {
    price += 2 + Math.sin(i) * 3;
    candles.push({
      candle_start: new Date(Date.now() - (30 - i) * 60000).toISOString(),
      open: price - 1,
      high: price + 3,
      low: price - 2,
      close: price,
      volume: 4500,
      source_mode: 'SIMULATED',
    });
  }

  const exp = await stockExplanationService.explainStock('RELIANCE', 'NSE', candles, '15m');

  assert.equal(exp.symbol, 'RELIANCE');
  assert.equal(exp.exchange, 'NSE');
  assert.ok(exp.currentPrice > 2900, 'Current price must be grounded');

  // 1. Verify VERIFIED FACTS
  assert.ok(exp.verifiedFacts.length >= 4, 'Must have at least 4 verified facts');
  for (const fact of exp.verifiedFacts) {
    assert.ok(fact.label, 'Fact must have label');
    assert.ok(fact.value, 'Fact must have value');
    assert.ok(fact.timestamp, 'Fact must have timestamp');
    assert.ok(fact.source, 'Fact must have provenance source');
  }

  // 2. Verify POSSIBLE INTERPRETATIONS
  assert.ok(exp.possibleInterpretations.length >= 2, 'Must have interpretations');
  for (const interp of exp.possibleInterpretations) {
    assert.ok(interp.title, 'Interpretation must have title');
    assert.ok(interp.description, 'Interpretation must have description');
    assert.ok(['BULLISH', 'BEARISH', 'NEUTRAL'].includes(interp.sentiment));
  }

  // 3. Verify Support & Resistance Pivot levels
  const { pivot, resistance1, support1, resistance2, support2 } = exp.keySupportResistance;
  assert.ok(resistance2 >= resistance1, 'R2 must be >= R1');
  assert.ok(resistance1 >= pivot, 'R1 must be >= Pivot');
  assert.ok(pivot >= support1, 'Pivot must be >= S1');
  assert.ok(support1 >= support2, 'S1 must be >= S2');

  // 4. Verify Beginner vs Advanced distinction
  assert.ok(exp.beginnerSummary.length > 50);
  assert.ok(exp.beginnerSummary.includes('RELIANCE'));
  assert.ok(exp.beginnerSummary.includes('guarantee') || exp.beginnerSummary.includes('fluctuate') || exp.beginnerSummary.includes('risk'), 'Beginner summary must include risk awareness');

  assert.ok(exp.advancedSummary.length > 50);
  assert.ok(exp.advancedSummary.includes('EMA'));
  assert.ok(exp.advancedSummary.includes('RSI'));
  assert.ok(exp.advancedSummary.includes('MACD'));
});

test('Explain My Stock: Bearish Stock Explanation Generation', async () => {
  const candles: any[] = [];
  let price = 4200;
  for (let i = 0; i < 30; i++) {
    price -= 5;
    candles.push({
      candle_start: new Date(Date.now() - (30 - i) * 60000).toISOString(),
      open: price + 2,
      high: price + 3,
      low: price - 3,
      close: price,
      volume: 6000,
      source_mode: 'SIMULATED',
    });
  }

  const exp = await stockExplanationService.explainStock('TCS', 'NSE', candles, '15m');
  assert.equal(exp.symbol, 'TCS');
  assert.equal(exp.trendClassification, 'BEARISH');
  assert.ok(exp.beginnerSummary.includes('downward pressure') || exp.beginnerSummary.includes('sellers'));
  assert.ok(exp.advancedSummary.includes('BEARISH'));
});
