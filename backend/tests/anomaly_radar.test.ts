import test from 'node:test';
import assert from 'node:assert/strict';
import { anomalyRadarService, AnomalyMetricBreakdown } from '../src/modules/radar/anomalyRadarService.js';
import { marketInvestigatorService } from '../src/modules/radar/investigatorService.js';
import { catalogueService } from '../src/modules/market/catalogueService.js';

test('Anomaly Radar: Deterministic Statistical Anomaly Score Calculation', () => {
  // Scenario 1: Critical Price Spike with Extreme Z-Score
  const extremeMetrics: AnomalyMetricBreakdown = {
    dailyReturnPct: 9.85,
    returnZScore: 4.2,
    volume: 1200000,
    volumeMovingAverage: 200000,
    volumeSpikeRatio: 6.0,
    intradaySpreadPct: 11.2,
    volatilityZScore: 3.8,
    sectorDivergencePct: 7.5,
    sectorName: 'Information Technology',
    sectorAverageReturnPct: 2.35,
  };

  const extremeResult = anomalyRadarService.calculateAnomalyScore(extremeMetrics);
  assert.ok(extremeResult.score >= 80, 'Extreme move must result in score >= 80');
  assert.equal(extremeResult.severity, 'CRITICAL');
  assert.ok(extremeResult.score <= 100, 'Score must be strictly bounded <= 100');

  // Scenario 2: Moderate Volume Spike with Subdued Price Move
  const volumeSurgeMetrics: AnomalyMetricBreakdown = {
    dailyReturnPct: 0.85,
    returnZScore: 0.45,
    volume: 950000,
    volumeMovingAverage: 250000,
    volumeSpikeRatio: 3.8,
    intradaySpreadPct: 1.4,
    volatilityZScore: 0.65,
    sectorDivergencePct: 0.2,
    sectorName: 'Banking & Financial Services',
    sectorAverageReturnPct: 0.65,
  };

  const volumeResult = anomalyRadarService.calculateAnomalyScore(volumeSurgeMetrics);
  assert.equal(volumeResult.anomalyType, 'VOLUME_SURGE');
  assert.ok(volumeResult.reason.includes('3.8x'), 'Reason must explicitly reference measured volume ratio');
  assert.ok(['ELEVATED', 'MODERATE'].includes(volumeResult.severity));

  // Scenario 3: Sector Decoupling / Divergence
  const sectorDivMetrics: AnomalyMetricBreakdown = {
    dailyReturnPct: 6.5,
    returnZScore: 3.1,
    volume: 450000,
    volumeMovingAverage: 220000,
    volumeSpikeRatio: 2.05,
    intradaySpreadPct: 4.1,
    volatilityZScore: 1.8,
    sectorDivergencePct: 5.2,
    sectorName: 'Automobile',
    sectorAverageReturnPct: 1.3,
  };

  const divResult = anomalyRadarService.calculateAnomalyScore(sectorDivMetrics);
  assert.equal(divResult.anomalyType, 'SECTOR_DIVERGENCE');
  assert.ok(divResult.reason.includes('Automobile'));
});

test('Anomaly Radar: Stale & Missing Data Robustness', () => {
  // Test with zero volume and undefined/null-tolerant metrics
  const missingDataMetrics: AnomalyMetricBreakdown = {
    dailyReturnPct: 0,
    returnZScore: 0,
    volume: 0,
    volumeMovingAverage: 1000,
    volumeSpikeRatio: 0,
    intradaySpreadPct: 0,
    volatilityZScore: 0,
    sectorDivergencePct: 0,
    sectorName: 'Equities',
    sectorAverageReturnPct: 0,
  };

  const res = anomalyRadarService.calculateAnomalyScore(missingDataMetrics);
  assert.equal(res.severity, 'MODERATE');
  assert.ok(res.score >= 10 && res.score <= 30);
  assert.ok(!isNaN(res.score), 'Score must never be NaN');
});

test('Anomaly Radar: Historical Backtest & False-Positive Rate Estimation', async () => {
  const backtest = await anomalyRadarService.runHistoricalBacktest(30);

  assert.equal(backtest.baselineWindowDays, 30);
  assert.ok(backtest.precisionRatePct >= 50 && backtest.precisionRatePct <= 95, 'Precision rate must be realistically calibrated');
  assert.ok(backtest.falsePositiveRatePct >= 5 && backtest.falsePositiveRatePct <= 50, 'False positive rate must be tracked');
  assert.equal(
    Math.round(backtest.precisionRatePct + backtest.falsePositiveRatePct),
    100,
    'Precision and False-Positive rate must sum to 100%'
  );
  assert.ok(backtest.truePositiveCount >= backtest.falsePositiveCount);
});

test('Anomaly Radar: Watchlist Anomaly Rules Management', () => {
  const testUserId = 'user-test-radar-rules';

  // Fetch initial default rules
  const initialRules = anomalyRadarService.getUserRules(testUserId);
  assert.ok(initialRules.length >= 1, 'Default rule must exist for user');

  // Save custom anomaly rule
  const created = anomalyRadarService.saveUserRule(testUserId, {
    symbol: 'TATAMOTORS',
    exchange: 'NSE',
    returnZThreshold: 3.0,
    volumeSpikeMultiplier: 4.5,
    volatilityThreshold: 2.5,
    sectorDivergenceThreshold: 3.5,
    severityMin: 'CRITICAL',
    active: true,
  });

  assert.ok(created.id);
  assert.equal(created.symbol, 'TATAMOTORS');
  assert.equal(created.returnZThreshold, 3.0);
  assert.equal(created.volumeSpikeMultiplier, 4.5);

  const updatedRules = anomalyRadarService.getUserRules(testUserId);
  assert.ok(updatedRules.some(r => r.id === created.id));

  // Delete rule
  const deleted = anomalyRadarService.deleteUserRule(testUserId, created.id);
  assert.equal(deleted, true);
  const remainingRules = anomalyRadarService.getUserRules(testUserId);
  assert.ok(!remainingRules.some(r => r.id === created.id));
});

test('Market Move Investigator: Verified Timeline & Fact vs Hypothesis Separation', async () => {
  // Test investigation for Reliance
  const report = await marketInvestigatorService.investigateMove('NSE', 'RELIANCE', '2026-10-23');

  assert.equal(report.symbol, 'RELIANCE');
  assert.equal(report.exchange, 'NSE');
  assert.ok(report.timeline.length > 0, 'Must have verified corporate filings for Reliance');
  assert.equal(report.timeline[0].verificationStatus, 'OFFICIALLY_VERIFIED');
  assert.ok(report.timeline[0].source.includes('NSE Corporate Announcement Feed'));

  // AI Report verification
  const ai = report.aiReport;
  assert.ok(ai.executiveSummary.toLowerCase().includes('reliance'));
  assert.equal(ai.causalAssessment.conclusiveness, 'DEFINITIVE_CAUSE_ESTABLISHED');
  assert.ok(ai.causalAssessment.explanation.includes('Q2'));

  // Strict Fact vs Hypothesis separation
  assert.ok(ai.hypothesesVsFacts.verifiedFacts.length >= 3, 'Must contain concrete verified facts');
  assert.ok(ai.hypothesesVsFacts.verifiedFacts.some(f => f.includes('Closing Price')));
  assert.ok(ai.hypothesesVsFacts.verifiedFacts.some(f => f.includes('Exchange Filing')));

  // Quantitative Evidence
  assert.ok(ai.measuredQuantitativeEvidence.priceMove.close > 0);
  assert.ok(ai.measuredQuantitativeEvidence.volumeDynamics.spikeMultiplier > 0);

  // Disclaimer compliance
  assert.ok(ai.disclaimer.includes('does not constitute investment advice'));
  assert.ok(ai.disclaimer.includes('quantitative investigation is generated deterministically'));
});

test('Market Move Investigator: Safe Handling When No Corporate News Exists (Zero Fabrication)', async () => {
  // Test investigation for an instrument without verified news
  const unannouncedReport = await marketInvestigatorService.investigateMove('NSE', 'UNKNOWN_TEST_STOCK', '2026-10-24');

  assert.equal(unannouncedReport.timeline.length, 0, 'Must not fabricate false filings');
  assert.equal(
    unannouncedReport.aiReport.causalAssessment.conclusiveness,
    'CAUSE_CANNOT_BE_ESTABLISHED',
    'Must explicitly state when cause cannot be established rather than inventing synthetic rationale'
  );
  assert.ok(
    unannouncedReport.aiReport.causalAssessment.explanation.includes('No verified corporate disclosure'),
    'Explanation must clarify absence of corporate filings'
  );
  assert.ok(
    unannouncedReport.aiReport.executiveSummary.includes('No official company announcement'),
    'Executive summary must not invent stories'
  );
});
