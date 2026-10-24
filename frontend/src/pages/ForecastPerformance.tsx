import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { HorizonPerformance } from '../types/index.js';
import { Award, ShieldAlert, CheckCircle, TrendingUp, HelpCircle, BarChart3 } from 'lucide-react';

export const ForecastPerformance: React.FC = () => {
  const [symbol, setSymbol] = useState<string>('RELIANCE');
  const [performance, setPerformance] = useState<Record<string, HorizonPerformance>>({});
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function fetchPerf() {
      try {
        setLoading(true);
        const res = await api.get(`/api/forecasts/NSE/${symbol}/performance`);
        setPerformance(res.performance || {});
      } catch (err) {
        console.error('Failed fetching performance metrics:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchPerf();
  }, [symbol]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">
              Machine Learning Forecast Performance
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Empirical walk-forward evaluation against subsequent observed exchange prices
          </p>
        </div>

        {/* Stock Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Select Equity:</span>
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono font-bold text-white focus:outline-none focus:border-cyan-500"
          >
            <option value="RELIANCE">RELIANCE (NSE)</option>
            <option value="TCS">TCS (NSE)</option>
            <option value="INFY">INFY (NSE)</option>
            <option value="HDFCBANK">HDFCBANK (NSE)</option>
            <option value="TATAMOTORS">TATAMOTORS (NSE)</option>
          </select>
        </div>
      </div>

      {/* Honest Scientific Methodology Banner */}
      <div className="p-4 rounded-2xl glass-card border border-blue-500/20 bg-blue-950/20 flex items-start gap-3">
        <BarChart3 className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300 leading-relaxed">
          <p className="font-semibold text-white mb-0.5">Strict Zero-Leakage Evaluation Protocol</p>
          <p className="text-slate-400">
            Every rolling forecast is issued at timestamp <span className="font-mono text-cyan-300">t</span> using only information available prior to <span className="font-mono text-cyan-300">t</span>. 
            Once target time <span className="font-mono text-cyan-300">t + h</span> arrives, the forecast is evaluated strictly against the observed close of that target minute. Models are benchmarked directly against the Naive Random-Walk Baseline (where future price equals anchor price).
          </p>
        </div>
      </div>

      {/* Horizon Performance Cards (1m, 5m, 15m) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 5, 15].map((h) => {
          const perf = performance[`${h}m`];
          const hasData = perf && perf.sampleCount > 0;
          const beatsBaseline = (perf?.baselineImprovementPct || 0) > 0;

          return (
            <div
              key={h}
              className="p-5 rounded-2xl glass-card border border-slate-800 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                  <div>
                    <span className="text-base font-bold text-white font-mono">
                      Horizon: +{h} Minute{h > 1 ? 's' : ''}
                    </span>
                    <p className="text-[11px] text-slate-500">
                      {h === 15 ? 'Gradient Boosting Regressor' : 'L2 Ridge Regression'}
                    </p>
                  </div>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    n = {perf?.sampleCount || 0}
                  </span>
                </div>

                <div className="space-y-3.5 text-xs font-mono">
                  {/* Metric 1: MAE vs Baseline */}
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Mean Abs Error (MAE):</span>
                    <div className="text-right">
                      <span className="font-bold text-white">₹{perf?.mae?.toFixed(2) || '0.00'}</span>
                      <span className="text-[10px] text-slate-500 block">
                        Naive: ₹{perf?.naiveMae?.toFixed(2) || '0.00'}
                      </span>
                    </div>
                  </div>

                  {/* Metric 2: RMSE */}
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Root Mean Sq (RMSE):</span>
                    <span className="font-bold text-slate-200">₹{perf?.rmse?.toFixed(2) || '0.00'}</span>
                  </div>

                  {/* Metric 3: Baseline Improvement */}
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Baseline Improvement:</span>
                    <span
                      className={`font-bold flex items-center gap-0.5 ${
                        beatsBaseline ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {beatsBaseline ? '+' : ''}
                      {perf?.baselineImprovementPct?.toFixed(1) || '0.0'}%
                    </span>
                  </div>

                  {/* Metric 4: Directional Accuracy */}
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Directional Accuracy:</span>
                    <span className="font-bold text-purple-400">
                      {perf?.directionalAccuracyPct?.toFixed(1) || '50.0'}%
                    </span>
                  </div>

                  {/* Metric 5: Empirical Interval Coverage */}
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">80% Interval Coverage:</span>
                    <span className="font-bold text-cyan-400">
                      {perf?.intervalCoveragePct?.toFixed(1) || '80.0'}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Status Badge */}
              <div className="mt-5 pt-3 border-t border-slate-800/80">
                <div
                  className={`p-2.5 rounded-xl text-[11px] flex items-center gap-2 ${
                    beatsBaseline
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  {beatsBaseline ? (
                    <CheckCircle className="w-4 h-4 shrink-0" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                  )}
                  <span>
                    {hasData
                      ? perf.evidenceStatus
                      : 'Awaiting sufficient walk-forward evaluated samples.'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
