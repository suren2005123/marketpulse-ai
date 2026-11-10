import React, { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useSocket } from '../context/SocketContext.js';
import { CandlestickChart } from '../components/charts/CandlestickChart.js';
import { Candle, Forecast, ForecastHistoryItem } from '../types/index.js';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  Bell,
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from 'lucide-react';

export const StockDetail: React.FC = () => {
  const { symbol = 'RELIANCE' } = useParams<{ symbol: string }>();
  const [searchParams] = useSearchParams();
  const exchangeParam = (searchParams.get('exchange') || 'NSE').toUpperCase();
  const { socket, quotes, latestForecasts, reconnectCount, feedStatus } = useSocket();

  const [candles, setCandles] = useState<Candle[]>([]);
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [history, setHistory] = useState<ForecastHistoryItem[]>([]);
  const [quoteDetails, setQuoteDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Progressive live subscription for current stock
  useEffect(() => {
    if (socket && symbol) {
      socket.emit('subscribe:instruments', [symbol]);
    }
  }, [socket, symbol]);

  // New Alert modal state
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertThreshold, setAlertThreshold] = useState('');
  const [alertType, setAlertType] = useState<'PRICE_ABOVE' | 'PRICE_BELOW'>('PRICE_ABOVE');
  const [creatingAlert, setCreatingAlert] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function fetchAll() {
      try {
        setLoading(true);
        const [quoteRes, candleRes, fcRes, histRes] = await Promise.all([
          api.get(`/api/market/${exchangeParam}/${symbol}/quote`),
          api.get(`/api/market/${exchangeParam}/${symbol}/candles?limit=100`),
          api.get(`/api/forecasts/${exchangeParam}/${symbol}`),
          api.get(`/api/forecasts/${exchangeParam}/${symbol}/history`),
        ]);

        if (isMounted) {
          setQuoteDetails(quoteRes.data);
          setCandles(candleRes.data || []);
          setForecasts(fcRes.forecasts || []);
          setHistory(histRes.data || []);
          if (quoteRes.data) {
            setAlertThreshold(String(quoteRes.data.price));
          }
        }
      } catch (err) {
        console.warn('Stock detail operating in presentation preview mode:', err);
        if (isMounted) {
          const sym = symbol || 'RELIANCE';
          const list: Candle[] = [];
          let p = 2500;
          const now = Date.now();
          for (let i = 59; i >= 0; i--) {
            const time = new Date(now - i * 60 * 1000).toISOString();
            const delta = (Math.sin(i * 0.2) + Math.cos(i * 0.5)) * (p * 0.002);
            const open = p;
            const close = Number((p + delta).toFixed(2));
            const high = Number((Math.max(open, close) + p * 0.001).toFixed(2));
            const low = Number((Math.min(open, close) - p * 0.001).toFixed(2));
            list.push({
              id: `c-detail-${i}`,
              instrumentId: sym,
              candleStart: time,
              timestamp: time,
              open,
              high,
              low,
              close,
              volume: Math.floor(10000 + Math.random() * 20000),
              sourceMode: 'SIMULATED',
              provider: 'SIMULATED_FEED',
            });
            p = close;
          }
          const lastC = list[list.length - 1];
          setCandles(list);
          setQuoteDetails({
            symbol: sym,
            exchange: exchangeParam || 'NSE',
            price: lastC.close,
            change: 12.50,
            changePct: 0.50,
            high: 2530,
            low: 2470,
            open: 2485,
            close: lastC.close,
            volume: 250000,
            timestamp: new Date().toISOString(),
            sourceMode: 'SIMULATED',
          } as any);
          setAlertThreshold(String(lastC.close));
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchAll();
    return () => {
      isMounted = false;
    };
  }, [symbol, reconnectCount]);

  const liveQuote = quotes[symbol];
  const price = liveQuote?.price || quoteDetails?.price || 2980;
  const change = liveQuote?.change ?? (quoteDetails?.change || 0);
  const changePct = liveQuote?.changePct ?? (quoteDetails?.changePct || 0);
  const isPos = change >= 0;

  const activeForecasts = latestForecasts[symbol] || forecasts;

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreatingAlert(true);
      await api.post('/api/alerts', {
        instrumentId: symbol,
        conditionType: alertType,
        threshold: parseFloat(alertThreshold),
      });
      alert(`Alert successfully configured for ${symbol}!`);
      setShowAlertModal(false);
    } catch (err: any) {
      alert(err.message || 'Failed to create alert');
    } finally {
      setCreatingAlert(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/explorer"
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-white font-mono">{symbol}</h2>
              <span className="text-xs px-2 py-0.5 rounded bg-blue-950 text-blue-400 font-mono border border-blue-800/40">
                NSE
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                {quoteDetails?.sector || 'Equities'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{quoteDetails?.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAlertModal(true)}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-white flex items-center gap-2 transition-colors"
          >
            <Bell className="w-3.5 h-3.5 text-cyan-400" />
            Set Price Alert
          </button>
        </div>
      </div>

      {/* Quote summary card */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-xl glass-card border border-slate-800">
          <span className="text-[10px] text-slate-500 font-mono uppercase">Current Price</span>
          <p className="text-xl font-bold text-white font-mono mt-0.5">₹{price.toFixed(2)}</p>
          <p className={`text-[11px] font-semibold font-mono ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isPos ? '+' : ''}
            {change.toFixed(2)} ({isPos ? '+' : ''}
            {changePct.toFixed(2)}%)
          </p>
        </div>

        <div className="p-3.5 rounded-xl glass-card border border-slate-800">
          <span className="text-[10px] text-slate-500 font-mono uppercase">Open</span>
          <p className="text-base font-bold text-slate-200 font-mono mt-0.5">
            ₹{(quoteDetails?.open || price).toFixed(2)}
          </p>
        </div>

        <div className="p-3.5 rounded-xl glass-card border border-slate-800">
          <span className="text-[10px] text-slate-500 font-mono uppercase">High</span>
          <p className="text-base font-bold text-emerald-400 font-mono mt-0.5">
            ₹{(quoteDetails?.high || price).toFixed(2)}
          </p>
        </div>

        <div className="p-3.5 rounded-xl glass-card border border-slate-800">
          <span className="text-[10px] text-slate-500 font-mono uppercase">Low</span>
          <p className="text-base font-bold text-rose-400 font-mono mt-0.5">
            ₹{(quoteDetails?.low || price).toFixed(2)}
          </p>
        </div>

        <div className="p-3.5 rounded-xl glass-card border border-slate-800">
          <span className="text-[10px] text-slate-500 font-mono uppercase">Prev Close</span>
          <p className="text-base font-bold text-slate-400 font-mono mt-0.5">
            ₹{(quoteDetails?.prevClose || price).toFixed(2)}
          </p>
        </div>

        <div className="p-3.5 rounded-xl glass-card border border-slate-800">
          <span className="text-[10px] text-slate-500 font-mono uppercase">Volume (1m)</span>
          <p className="text-base font-bold text-slate-300 font-mono mt-0.5">
            {(quoteDetails?.volume || 5420).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Candlestick & Forecast Chart */}
      <CandlestickChart
        symbol={symbol}
        candles={candles}
        forecasts={activeForecasts}
        sourceMode={feedStatus?.mode || 'SIMULATED'}
      />

      {/* Historical Forecast Evaluation Table */}
      <div className="p-5 rounded-2xl glass-card border border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">Historical Forecast Evaluations</h3>
          </div>
          <span className="text-xs text-slate-400">
            Observed actual price vs prediction target
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                <th className="pb-2">ISSUED AT</th>
                <th className="pb-2">HORIZON</th>
                <th className="pb-2 text-right">ANCHOR</th>
                <th className="pb-2 text-right">PREDICTED</th>
                <th className="pb-2 text-right">80% INTERVAL</th>
                <th className="pb-2 text-right">ACTUAL PRICE</th>
                <th className="pb-2 text-right">ABS ERROR</th>
                <th className="pb-2 text-center">DIRECTION</th>
                <th className="pb-2 text-center">IN INTERVAL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {history.map((hItem) => {
                const issuedStr = new Date(hItem.issuedAt).toLocaleTimeString('en-IN', {
                  timeZone: 'Asia/Kolkata',
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const isEvaluated = hItem.evaluationStatus === 'EVALUATED';

                return (
                  <tr key={hItem.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 text-slate-400">{issuedStr} IST</td>
                    <td className="py-2.5 text-cyan-400 font-bold">+{hItem.horizonMinutes}m</td>
                    <td className="py-2.5 text-right text-slate-400">₹{hItem.anchorPrice.toFixed(2)}</td>
                    <td className="py-2.5 text-right font-bold text-white">₹{hItem.predictedPrice.toFixed(2)}</td>
                    <td className="py-2.5 text-right text-slate-400 text-[11px]">
                      ₹{hItem.lowerBound.toFixed(2)} - ₹{hItem.upperBound.toFixed(2)}
                    </td>
                    <td className="py-2.5 text-right font-bold text-slate-200">
                      {isEvaluated && hItem.actualPrice ? `₹${hItem.actualPrice.toFixed(2)}` : 'Pending'}
                    </td>
                    <td className="py-2.5 text-right text-slate-300">
                      {isEvaluated && hItem.absoluteError !== undefined && hItem.absoluteError !== null
                        ? `₹${hItem.absoluteError.toFixed(2)}`
                        : '--'}
                    </td>
                    <td className="py-2.5 text-center">
                      {isEvaluated && hItem.directionalCorrect !== undefined ? (
                        hItem.directionalCorrect ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 inline" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-400 inline" />
                        )
                      ) : (
                        <HelpCircle className="w-4 h-4 text-slate-600 inline" />
                      )}
                    </td>
                    <td className="py-2.5 text-center">
                      {isEvaluated && hItem.insideInterval !== undefined ? (
                        hItem.insideInterval ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/50">
                            YES
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800/50">
                            OUT
                          </span>
                        )
                      ) : (
                        <span className="text-[10px] text-slate-600">--</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Set Alert Modal */}
      {showAlertModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#0e131f] border border-slate-800 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              <Bell className="w-4 h-4 text-cyan-400" />
              Configure Alert: {symbol}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Real-time notification delivered to your private user socket room.
            </p>

            <form onSubmit={handleCreateAlert} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Condition</label>
                <select
                  value={alertType}
                  onChange={(e: any) => setAlertType(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                >
                  <option value="PRICE_ABOVE">Price Crosses Above (&gt;=)</option>
                  <option value="PRICE_BELOW">Price Crosses Below (&lt;=)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Threshold Price (₹)
                </label>
                <input
                  type="number"
                  step="0.05"
                  required
                  value={alertThreshold}
                  onChange={(e) => setAlertThreshold(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAlertModal(false)}
                  className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingAlert}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white"
                >
                  {creatingAlert ? 'Saving...' : 'Set Alert'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
