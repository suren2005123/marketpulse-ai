import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db/index.js';
import { seedDatabase } from '../src/db/seed.js';
import { forecastService } from '../src/modules/forecasts/forecastService.js';

test('Forecasting: Horizons and Prediction Interval Consistency', async () => {
  await seedDatabase();

  // Test forecast generation for RELIANCE
  const forecasts = await forecastService.generateForecastsForInstrument('RELIANCE', 'NSE');

  assert.ok(forecasts.length >= 3, 'Must generate forecasts for 1m, 5m, and 15m horizons');

  for (const fc of forecasts) {
    assert.ok([1, 5, 15].includes(fc.horizonMinutes), `Horizon ${fc.horizonMinutes} must be one of [1, 5, 15]`);
    assert.ok(fc.predictedPrice > 0, 'Predicted price must be positive');
    assert.ok(fc.lowerBound <= fc.predictedPrice, 'Lower bound must be <= predicted price');
    assert.ok(fc.upperBound >= fc.predictedPrice, 'Upper bound must be >= predicted price');
    assert.ok(fc.probabilityUp >= 0.05 && fc.probabilityUp <= 0.95, 'Probability up must be calibrated between 5% and 95%');
    assert.equal(fc.evaluationStatus, 'PENDING', 'New forecast must be in PENDING state');
    assert.ok(new Date(fc.targetTime).getTime() > new Date(fc.issuedAt).getTime(), 'Target time must be strictly in the future');
  }
});

test('Forecasting: Walk-Forward Evaluation against Observed Market Price', async () => {
  await db.init();

  const testFcId = 'fc-eval-test-001';
  const anchorPrice = 3000.00;
  const predictedPrice = 3020.00;
  const lowerBound = 2990.00;
  const upperBound = 3040.00;

  // Insert a forecast whose target time is in the past
  db.store.forecasts.push({
    id: testFcId,
    instrument_id: 'inst-rel',
    issued_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    target_time: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // Target time passed
    horizon_minutes: 5,
    anchor_price: anchorPrice,
    predicted_price: predictedPrice,
    lower_bound: lowerBound,
    upper_bound: upperBound,
    probability_up: 0.65,
    model_version: 'v2.1.0',
    source_mode: 'SIMULATED',
    evaluation_status: 'PENDING',
  });

  // Evaluate with actual observed price = 3015.00
  const actualPrice = 3015.00;
  const evaluations = forecastService.evaluatePendingForecasts('RELIANCE', actualPrice);

  assert.ok(evaluations.length >= 1, 'Must evaluate eligible pending forecast');
  const evaluatedRecord = evaluations.find(e => e.forecast_id === testFcId);
  assert.ok(evaluatedRecord, 'Target forecast must be evaluated');

  // Prediction was 3020, actual was 3015 -> abs error = 5.00
  assert.equal(evaluatedRecord.absolute_error, 5.00);
  // Both anchor -> predicted and anchor -> actual went UP (3000 -> 3020 and 3000 -> 3015)
  assert.equal(evaluatedRecord.directional_correctness, true, 'Directional prediction was correct (UP)');
  // 3015 is between 2990 and 3040
  assert.equal(evaluatedRecord.inside_interval, true, 'Actual price landed inside 80% interval');

  // Verify status in DB updated to EVALUATED
  const updatedFc = db.store.forecasts.find(f => f.id === testFcId);
  assert.equal(updatedFc?.evaluation_status, 'EVALUATED');
});
