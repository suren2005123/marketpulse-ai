import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateATR,
  calculateBollingerBands,
  trendAnalysisService,
} from '../src/modules/analysis/trendAnalysisService.js';

test('Trend Analysis: Mathematical Indicators Accuracy', () => {
  const series = [100, 102, 104, 106, 108, 110, 112, 114, 116, 118, 120];

  // 1. SMA calculation
  const sma5 = calculateSMA(series, 5);
  // Last 5: 112, 114, 116, 118, 120 -> sum = 580 -> avg = 116
  assert.equal(sma5, 116);

  // 2. EMA calculation
  const ema5 = calculateEMA(series, 5);
  assert.ok(ema5 > 110 && ema5 <= 120, 'EMA5 must be within recent price window');

  // 3. RSI calculation on monotonic uptrend (should be near 100)
  const rsiUp = calculateRSI(series, 5);
  assert.equal(rsiUp, 100, 'Monotonically rising prices must yield RSI = 100');

  // 4. RSI on monotonic downtrend (should be near 0)
  const downSeries = [120, 118, 116, 114, 112, 110, 108, 106, 104, 102, 100];
  const rsiDown = calculateRSI(downSeries, 5);
  assert.equal(rsiDown, 0, 'Monotonically falling prices must yield RSI = 0');

  // 5. Bollinger Bands calculation
  const bb = calculateBollingerBands(series, 5, 2);
  assert.ok(bb.upper > bb.middle, 'Upper band must be above middle');
  assert.ok(bb.middle > bb.lower, 'Middle band must be above lower');
  assert.equal(bb.middle, 116);

  // 6. ATR calculation
  const highs = [105, 107, 109, 111, 113];
  const lows = [98, 100, 102, 104, 106];
  const closes = [102, 104, 106, 108, 110];
  const atr = calculateATR(highs, lows, closes, 4);
  assert.ok(atr > 0, 'ATR must be positive');
});

test('Trend Analysis: Bullish Regime Classification and Evidence Verification', () => {
  // Generate 40 synthetic candles in clear upward trend
  const candles: any[] = [];
  let basePrice = 1000;
  for (let i = 0; i < 40; i++) {
    basePrice += 5 + Math.sin(i) * 2;
    candles.push({
      candle_start: new Date(Date.now() - (40 - i) * 60000).toISOString(),
      open: basePrice - 2,
      high: basePrice + 4,
      low: basePrice - 3,
      close: basePrice,
      volume: 5000 + i * 200, // rising volume
      source_mode: 'SIMULATED',
    });
  }

  const analysis = trendAnalysisService.analyzeTrend('RELIANCE', 'NSE', candles, '15m');

  assert.equal(analysis.symbol, 'RELIANCE');
  assert.equal(analysis.exchange, 'NSE');
  assert.equal(analysis.classification, 'BULLISH', 'Strong upward series must be classified as BULLISH');
  assert.ok(analysis.confidenceScore >= 60, 'Confidence score must be >= 60% for strong trend');
  assert.ok(analysis.indicators.rsi > 50, 'RSI must reflect positive momentum');
  assert.ok(analysis.indicators.movingAverages.alignment.includes('BULLISH'));

  // Evidence matrix verification
  assert.ok(analysis.evidence.length >= 4, 'Must have at least 4 distinct indicator evidence factors');
  const bullishVotes = analysis.evidence.filter(e => e.verdict === 'BULLISH');
  assert.ok(bullishVotes.length >= 2, 'Must have multiple confirming bullish factors');

  // Verify Beginner and Advanced explanations exist and reference actual numbers
  assert.ok(analysis.beginnerExplanation.includes('RELIANCE'));
  assert.ok(analysis.beginnerExplanation.includes('positive upward momentum') || analysis.beginnerExplanation.includes('higher than its'));
  assert.ok(analysis.advancedExplanation.includes('EMA'));
  assert.ok(analysis.advancedExplanation.includes(String(analysis.confidenceScore)));
});

test('Trend Analysis: Bearish Regime Classification', () => {
  // Generate 40 synthetic candles in clear downward trend
  const candles: any[] = [];
  let basePrice = 2000;
  for (let i = 0; i < 40; i++) {
    basePrice -= 8 + Math.cos(i) * 2;
    candles.push({
      candle_start: new Date(Date.now() - (40 - i) * 60000).toISOString(),
      open: basePrice + 3,
      high: basePrice + 4,
      low: basePrice - 4,
      close: basePrice,
      volume: 8000,
      source_mode: 'SIMULATED',
    });
  }

  const analysis = trendAnalysisService.analyzeTrend('TCS', 'NSE', candles, '15m');

  assert.equal(analysis.symbol, 'TCS');
  assert.equal(analysis.classification, 'BEARISH', 'Strong downward series must be classified as BEARISH');
  assert.ok(analysis.confidenceScore >= 60);
  assert.ok(analysis.indicators.rsi < 50, 'RSI must be in lower half');
  assert.ok(analysis.beginnerExplanation.includes('downward pressure') || analysis.beginnerExplanation.includes('sellers'));
});

test('Trend Analysis: Missing and Sparse Candle Robustness (Zero Crash)', () => {
  // 1. Empty array
  const emptyRes = trendAnalysisService.analyzeTrend('INFY', 'NSE', [], '15m');
  assert.equal(emptyRes.classification, 'SIDEWAYS');
  assert.equal(emptyRes.confidenceScore, 50);

  // 2. Too few candles (< 5)
  const sparseRes = trendAnalysisService.analyzeTrend('INFY', 'NSE', [
    { candle_start: new Date().toISOString(), open: 1800, high: 1810, low: 1795, close: 1805, volume: 100 },
  ], '15m');
  assert.equal(sparseRes.classification, 'SIDEWAYS');
  assert.ok(sparseRes.summary.includes('Insufficient'));
});
