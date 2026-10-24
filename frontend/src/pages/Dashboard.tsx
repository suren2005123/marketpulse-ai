import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext.js';
import { api } from '../api/client.js';
import { CandlestickChart } from '../components/charts/CandlestickChart.js';
import { Candle, Forecast, Instrument } from '../types/index.js';
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Clock,
  Radio,
  Star,
  Activity,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { socket, quotes, latestForecasts, reconnectCount, feedStatus, latency } = useSocket();

  const [selectedSymbol, setSelectedSymbol] = useState<string>('RELIANCE');
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [userWatchlist, setUserWatchlist] = useState<any[]>([]);
  const [userAlerts, setUserAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Progressive live subscription for dashboard instruments and watchlist
  useEffect(() => {
    if (!socket) return;
    const symbolsToSub = new Set<string>();
    if (selectedSymbol) symbolsToSub.add(selectedSymbol);
    for (const inst of instruments.slice(0, 10)) {
      symbolsToSub.add(inst.symbol);
    }
    for (const w of userWatchlist) {
      if (w.symbol) symbolsToSub.add(w.symbol);
    }
    if (symbolsToSub.size > 0) {
      socket.emit('subscribe:instruments', Array.from(symbolsToSub));
    }
  }, [socket, selectedSymbol, instruments, userWatchlist]);

  // Fetch initial REST data & on reconnect
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        setLoading(true);
        const [instRes, watchRes, alertRes] = await Promise.all([
          api.get('/api/instruments'),
          api.get('/api/watchlist').catch(() => ({ data: [] })),
          api.get('/api/alerts').catch(() => ({ data: [] })),
        ]);

        if (isMounted) {
          setInstruments(instRes.data || []);
          setUserWatchlist(watchRes.data || []);
          setUserAlerts(alertRes.data || []);
        }
      } catch (err) {
        console.error('Failed loading dashboard overview:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [reconnectCount]);

  // Load candles & forecasts when selected symbol changes
  useEffect(() => {
    let isMounted = true;

    async function loadSymbolData() {
      try {
        const [candleRes, forecastRes] = await Promise.all([
          api.get(`/api/market/NSE/${selectedSymbol}/candles?limit=60`),
          api.get(`/api/forecasts/NSE/${selectedSymbol}`),
        ]);

        if (isMounted) {
          setCandles(candleRes.data || []);
          setForecasts(forecastRes.forecasts || []);
        }
      } catch (err) {
        console.error(`Failed loading data for ${selectedSymbol}:`, err);
      }
    }

    loadSymbolData();
    return () => {
      isMounted = false;
    };
  }, [selectedSymbol, reconnectCount]);

  // Merge real-time updates for selected stock
  const currentLiveQuote = quotes[selectedSymbol];
  const lastCandle = candles[candles.length - 1];
  const displayPrice = currentLiveQuote?.price || lastCandle?.close || 2985.50;
  const prevPrice = lastCandle ? lastCandle.open : displayPrice;
  const priceChange = currentLiveQuote?.change ?? Number((displayPrice - prevPrice).toFixed(2));
  const changePct = currentLiveQuote?.changePct ?? Number(((priceChange / prevPrice) * 100).toFixed(2));
  const isPositive = priceChange >= 0;

  // Active forecasts (prefer real-time socket forecasts if available)
  const activeForecasts = latestForecasts[selectedSymbol] || forecasts;

  return (
    <div className="space-y-6">
      {/* Top Banner: Market Status & Overview Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Metric 1: Selected Instrument Quick Card */}
        <div className="p-4 rounded-2xl glass-card border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Active Stock (NSE)</span>
            <span className="font-mono text-cyan-400 font-semibold">{selectedSymbol}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-white">
              ₹{displayPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
            <span
              className={`text-xs font-semibold flex items-center font-mono ${
                isPositive ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {isPositive ? <TrendingUp className="w-3.5 h-3.5 mr-0.5" /> : <TrendingDown className="w-3.5 h-3.5 mr-0.5" />}
              {isPositive ? '+' : ''}
              {priceChange} ({isPositive ? '+' : ''}
              {changePct}%)
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1 font-mono">
            Last update: {new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
          </p>
        </div>

        {/* Metric 2: Live Latency Budget SLA */}
        <div className="p-4 rounded-2xl glass-card border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Measured Delivery Latency</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40 font-mono">
              SLA &lt; 2000ms
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-emerald-400">{latency.p50}ms</span>
            <span className="text-xs text-slate-400 font-mono">p50</span>
            <span className="text-slate-600">|</span>
            <span className="text-sm font-semibold font-mono text-cyan-400">{latency.p95}ms</span>
            <span className="text-xs text-slate-400 font-mono">p95</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">End-to-end screen delivery time</p>
        </div>

        {/* Metric 3: Active User Alerts */}
        <div className="p-4 rounded-2xl glass-card border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Your Price Alerts</span>
            <span className="font-mono text-purple-400 font-semibold">{userAlerts.length} configured</span>
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {userAlerts.filter((a) => a.active).length}{' '}
            <span className="text-xs text-slate-400 font-normal">monitoring active</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">Private to your authenticated account</p>
        </div>

        {/* Metric 4: Data Engine Status */}
        <div className="p-4 rounded-2xl glass-card border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Data Ingestion Engine</span>
            <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          </div>
          <div className="text-base font-bold text-white truncate">
            {feedStatus?.provider || 'Deterministic Engine'}
          </div>
          <p className="text-[10px] text-cyan-400 font-mono mt-1">
            Mode: {feedStatus?.mode || 'SIMULATED'}
          </p>
        </div>
      </div>

      {/* Stock Quick Switcher Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-xs font-semibold text-slate-400 shrink-0 mr-1 flex items-center gap-1 font-mono">
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          Top Indian Equities:
        </span>
        {instruments.slice(0, 7).map((inst) => {
          const isSelected = inst.symbol === selectedSymbol;
          const liveQ = quotes[inst.symbol];
          return (
            <button
              key={inst.id}
              onClick={() => setSelectedSymbol(inst.symbol)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 border transition-all shrink-0 ${
                isSelected
                  ? 'bg-blue-600/20 border-blue-500/60 text-white shadow-sm'
                  : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <span>{inst.symbol}</span>
              {liveQ && (
                <span className={`text-[10px] font-mono ${liveQ.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  ₹{liveQ.price}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Main Section: Chart + Rolling Forecast Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Interactive Candlestick Chart */}
        <div className="lg:col-span-2 space-y-4">
          <CandlestickChart
            symbol={selectedSymbol}
            candles={candles}
            forecasts={activeForecasts}
            sourceMode={feedStatus?.mode || 'SIMULATED'}
          />
        </div>

        {/* Right Col: Rolling ML Forecast Cards (1m, 5m, 15m) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              Rolling Price Forecasts
            </h3>
            <span className="text-[10px] font-mono text-slate-400">Ridge + GBR</span>
          </div>

          {[1, 5, 15].map((h) => {
            const fc = activeForecasts.find((f) => f.horizonMinutes === h);
            const anchor = fc?.anchorPrice || displayPrice;
            const pred = fc?.predictedPrice || displayPrice;
            const driftPct = Number((((pred - anchor) / anchor) * 100).toFixed(2));
            const isUp = driftPct >= 0;

            return (
              <div
                key={h}
                className="p-4 rounded-2xl glass-card border border-slate-800 hover:border-slate-700 transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-cyan-400 font-mono">
                    Horizon: +{h} Minute{h > 1 ? 's' : ''}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                    {fc ? new Date(fc.targetTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : '--:--'} IST
                  </span>
                </div>

                <div className="flex items-baseline justify-between mb-2">
                  <div>
                    <span className="text-xl font-bold font-mono text-white">
                      ₹{pred.toFixed(2)}
                    </span>
                    <span
                      className={`text-xs font-semibold ml-2 font-mono ${
                        isUp ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {isUp ? '+' : ''}
                      {driftPct}%
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400">Directional Probability</span>
                    <p className="text-xs font-bold font-mono text-purple-400">
                      {fc?.probabilityUp ? `${(fc.probabilityUp * 100).toFixed(1)}% Up` : '50.0% Neutral'}
                    </p>
                  </div>
                </div>

                {/* Uncertainty Interval Range */}
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>80% Interval:</span>
                  <span className="text-slate-300">
                    ₹{fc?.lowerBound?.toFixed(2) || (anchor * 0.995).toFixed(2)} - ₹
                    {fc?.upperBound?.toFixed(2) || (anchor * 1.005).toFixed(2)}
                  </span>
                </div>
              </div>
            );
          })}

          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400">
            <p className="font-semibold text-slate-300 mb-0.5">Model Methodology</p>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Leakage-free feature vector calculated at completed 1-minute candle boundaries. Empirical intervals derived from walk-forward validation residuals.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Section: Watchlist Table Preview */}
      <div className="p-5 rounded-2xl glass-card border border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white">Your Personal Watchlist</h3>
          </div>
          <span className="text-xs text-slate-400">
            {userWatchlist.length} stocks tracked in your account
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                <th className="pb-2 font-medium">SYMBOL</th>
                <th className="pb-2 font-medium">NAME</th>
                <th className="pb-2 font-medium">SECTOR</th>
                <th className="pb-2 font-medium text-right">LATEST PRICE</th>
                <th className="pb-2 font-medium text-right">CHANGE</th>
                <th className="pb-2 font-medium text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {userWatchlist.map((item) => {
                const liveQ = quotes[item.symbol];
                const p = liveQ?.price || item.price;
                const ch = liveQ?.change ?? item.change;
                const chPct = liveQ?.changePct ?? item.changePct;
                const isPos = ch >= 0;

                return (
                  <tr key={item.instrumentId} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 font-bold text-white">{item.symbol}</td>
                    <td className="py-3 text-slate-400 truncate max-w-[180px]">{item.name}</td>
                    <td className="py-3 text-slate-500">{item.sector}</td>
                    <td className="py-3 text-right font-bold text-white">₹{p.toFixed(2)}</td>
                    <td className={`py-3 text-right font-semibold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isPos ? '+' : ''}
                      {ch.toFixed(2)} ({isPos ? '+' : ''}
                      {chPct.toFixed(2)}%)
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => setSelectedSymbol(item.symbol)}
                        className="px-2.5 py-1 rounded-lg bg-blue-600/15 hover:bg-blue-600/30 text-blue-400 text-[11px] font-semibold transition-colors"
                      >
                        Analyze
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
