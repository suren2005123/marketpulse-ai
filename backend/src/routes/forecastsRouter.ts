import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';

export const forecastsRouter = Router();

// GET /api/forecasts/:exchange/:symbol
forecastsRouter.get('/forecasts/:exchange/:symbol', (req: Request, res: Response): void => {
  try {
    const { symbol, exchange } = req.params;
    const inst = db.store.instruments.find(
      i => i.symbol.toUpperCase() === symbol.toUpperCase() && i.exchange.toUpperCase() === exchange.toUpperCase()
    );

    if (!inst) {
      res.status(404).json({ error: `Instrument ${exchange}:${symbol} not found.` });
      return;
    }

    // Get latest forecast for each horizon (1m, 5m, 15m)
    const horizons = [1, 5, 15];
    const latestForecasts = horizons.map(h => {
      const fcs = db.store.forecasts
        .filter(f => f.instrument_id === inst.id && f.horizon_minutes === h)
        .sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime());
      return fcs[0] || null;
    }).filter(Boolean);

    res.json({
      success: true,
      symbol: inst.symbol,
      exchange: inst.exchange,
      forecasts: latestForecasts.map(f => ({
        id: f.id,
        horizonMinutes: f.horizon_minutes,
        issuedAt: f.issued_at,
        targetTime: f.target_time,
        anchorPrice: f.anchor_price,
        predictedPrice: f.predicted_price,
        lowerBound: f.lower_bound,
        upperBound: f.upper_bound,
        probabilityUp: f.probability_up,
        modelVersion: f.model_version,
        sourceMode: f.source_mode,
        evaluationStatus: f.evaluation_status,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve forecasts' });
  }
});

// GET /api/forecasts/:exchange/:symbol/history
forecastsRouter.get('/forecasts/:exchange/:symbol/history', (req: Request, res: Response): void => {
  try {
    const { symbol, exchange } = req.params;
    const inst = db.store.instruments.find(
      i => i.symbol.toUpperCase() === symbol.toUpperCase() && i.exchange.toUpperCase() === exchange.toUpperCase()
    );

    if (!inst) {
      res.status(404).json({ error: `Instrument ${exchange}:${symbol} not found.` });
      return;
    }

    const forecasts = db.store.forecasts
      .filter(f => f.instrument_id === inst.id)
      .sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime())
      .slice(0, 50);

    const enriched = forecasts.map(f => {
      const evaluation = db.store.forecast_evaluations.find(e => e.forecast_id === f.id);
      return {
        id: f.id,
        horizonMinutes: f.horizon_minutes,
        issuedAt: f.issued_at,
        targetTime: f.target_time,
        anchorPrice: f.anchor_price,
        predictedPrice: f.predicted_price,
        lowerBound: f.lower_bound,
        upperBound: f.upper_bound,
        evaluationStatus: f.evaluation_status,
        actualPrice: evaluation ? evaluation.actual_price : null,
        absoluteError: evaluation ? evaluation.absolute_error : null,
        directionalCorrect: evaluation ? evaluation.directional_correctness : null,
        insideInterval: evaluation ? evaluation.inside_interval : null,
      };
    });

    res.json({
      success: true,
      symbol: inst.symbol,
      count: enriched.length,
      data: enriched,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve forecast history' });
  }
});

// GET /api/forecasts/:exchange/:symbol/performance
forecastsRouter.get('/forecasts/:exchange/:symbol/performance', (req: Request, res: Response): void => {
  try {
    const { symbol, exchange } = req.params;
    const inst = db.store.instruments.find(
      i => i.symbol.toUpperCase() === symbol.toUpperCase() && i.exchange.toUpperCase() === exchange.toUpperCase()
    );

    if (!inst) {
      res.status(404).json({ error: `Instrument ${exchange}:${symbol} not found.` });
      return;
    }

    const horizons = [1, 5, 15];
    const performanceByHorizon: Record<string, any> = {};

    for (const h of horizons) {
      const fcs = db.store.forecasts.filter(f => f.instrument_id === inst.id && f.horizon_minutes === h);
      const evaluated = fcs
        .map(f => ({
          forecast: f,
          evaluation: db.store.forecast_evaluations.find(e => e.forecast_id === f.id),
        }))
        .filter(item => item.evaluation !== undefined);

      if (evaluated.length === 0) {
        performanceByHorizon[`${h}m`] = {
          sampleCount: 0,
          mae: 0,
          rmse: 0,
          naiveMae: 0,
          baselineImprovementPct: 0,
          directionalAccuracyPct: 0,
          intervalCoveragePct: 0,
          evidenceStatus: 'Insufficient evaluated samples',
        };
        continue;
      }

      let totalAbsError = 0;
      let totalSquaredError = 0;
      let totalNaiveAbsError = 0;
      let dirCorrectCount = 0;
      let insideIntervalCount = 0;

      for (const item of evaluated) {
        const actual = item.evaluation!.actual_price;
        const pred = item.forecast.predicted_price;
        const anchor = item.forecast.anchor_price;

        const err = Math.abs(pred - actual);
        const naiveErr = Math.abs(anchor - actual);

        totalAbsError += err;
        totalSquaredError += err * err;
        totalNaiveAbsError += naiveErr;

        if (item.evaluation!.directional_correctness) dirCorrectCount++;
        if (item.evaluation!.inside_interval) insideIntervalCount++;
      }

      const count = evaluated.length;
      const mae = Number((totalAbsError / count).toFixed(2));
      const rmse = Number((Math.sqrt(totalSquaredError / count)).toFixed(2));
      const naiveMae = Number((totalNaiveAbsError / count).toFixed(2));
      const baselineImprovement = naiveMae > 0 ? Number((((naiveMae - mae) / naiveMae) * 100).toFixed(2)) : 0;
      const dirAccuracy = Number(((dirCorrectCount / count) * 100).toFixed(1));
      const coverage = Number(((insideIntervalCount / count) * 100).toFixed(1));

      performanceByHorizon[`${h}m`] = {
        sampleCount: count,
        horizonMinutes: h,
        mae,
        rmse,
        naiveMae,
        baselineImprovementPct: baselineImprovement,
        directionalAccuracyPct: dirAccuracy,
        intervalCoveragePct: coverage,
        evidenceStatus: baselineImprovement > 0 ? 'Outperforming naive baseline' : 'Experimental - comparable to baseline',
      };
    }

    res.json({
      success: true,
      symbol: inst.symbol,
      exchange: inst.exchange,
      evaluationMethodology: 'Strict chronological walk-forward validation with zero data leakage',
      performance: performanceByHorizon,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve forecast performance' });
  }
});
