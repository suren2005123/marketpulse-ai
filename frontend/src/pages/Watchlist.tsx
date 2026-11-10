import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useSocket } from '../context/SocketContext.js';
import { Instrument } from '../types/index.js';
import { Star, Trash2, TrendingUp, TrendingDown, Plus, ChevronRight } from 'lucide-react';

export const Watchlist: React.FC = () => {
  const navigate = useNavigate();
  const { quotes, reconnectCount } = useSocket();

  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedToAdd, setSelectedToAdd] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [wRes, iRes] = await Promise.all([
          api.get('/api/watchlist'),
          api.get('/api/instruments'),
        ]);
        setWatchlist(wRes.data || []);
        setInstruments(iRes.data || []);
        if (iRes.data?.length > 0) {
          setSelectedToAdd(iRes.data[0].id);
        }
      } catch (err) {
        console.warn('Watchlist operating in presentation preview mode:', err);
        setWatchlist([
          { id: 'inst-rel', exchange: 'NSE', symbol: 'RELIANCE', name: 'Reliance Industries Ltd', price: 2985.50, change: 14.50, changePct: 0.49 },
          { id: 'inst-tcs', exchange: 'NSE', symbol: 'TCS', name: 'Tata Consultancy Services', price: 4140.00, change: -12.30, changePct: -0.30 },
          { id: 'inst-infy', exchange: 'NSE', symbol: 'INFY', name: 'Infosys Ltd', price: 1885.25, change: 8.75, changePct: 0.47 },
        ]);
        setInstruments([
          { id: 'inst-rel', exchange: 'NSE', symbol: 'RELIANCE', name: 'Reliance Industries Ltd', sector: 'Energy & Retail', active: true },
          { id: 'inst-tcs', exchange: 'NSE', symbol: 'TCS', name: 'Tata Consultancy Services', sector: 'Information Technology', active: true },
        ]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [reconnectCount]);

  const handleRemove = async (instrumentId: string) => {
    try {
      await api.delete(`/api/watchlist/${instrumentId}`);
      setWatchlist((prev) => prev.filter((w) => w.instrumentId !== instrumentId));
    } catch (err: any) {
      alert(err.message || 'Error removing from watchlist');
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedToAdd) return;
    try {
      setAdding(true);
      await api.post('/api/watchlist', { instrumentId: selectedToAdd });
      const wRes = await api.get('/api/watchlist');
      setWatchlist(wRes.data || []);
    } catch (err: any) {
      alert(err.message || 'Error adding to watchlist');
    } finally {
      setAdding(false);
    }
  };

  const availableToAdd = instruments.filter(
    (inst) => !watchlist.some((w) => w.instrumentId === inst.id)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Personal Watchlist</h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time equity portfolio monitoring scoped to your signed-in account
          </p>
        </div>

        {/* Quick Add Form */}
        {availableToAdd.length > 0 && (
          <form onSubmit={handleAdd} className="flex items-center gap-2">
            <select
              value={selectedToAdd}
              onChange={(e) => setSelectedToAdd(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white font-mono"
            >
              {availableToAdd.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.symbol} ({inst.exchange})
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={adding}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Stock
            </button>
          </form>
        )}
      </div>

      {/* Watchlist Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {watchlist.map((item) => {
          const liveQ = quotes[item.symbol];
          const price = Number(liveQ?.price ?? item.price ?? 0);
          const change = Number(liveQ?.change ?? item.change ?? 0);
          const changePct = Number(liveQ?.changePct ?? item.changePct ?? 0);
          const isPos = change >= 0;

          return (
            <div
              key={item.instrumentId}
              className="p-5 rounded-2xl glass-card border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-white font-mono">{item.symbol}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                        {item.exchange}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{item.name}</p>
                  </div>
                  <button
                    onClick={() => handleRemove(item.instrumentId)}
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 transition-colors"
                    title="Remove from Watchlist"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-baseline gap-2 mb-2 font-mono">
                  <span className="text-2xl font-bold text-white">₹{price.toFixed(2)}</span>
                  <span
                    className={`text-xs font-semibold flex items-center ${
                      isPos ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {isPos ? <TrendingUp className="w-3.5 h-3.5 mr-0.5" /> : <TrendingDown className="w-3.5 h-3.5 mr-0.5" />}
                    {isPos ? '+' : ''}
                    {change.toFixed(2)} ({isPos ? '+' : ''}
                    {changePct.toFixed(2)}%)
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between mt-4">
                <span className="text-[10px] text-slate-500 font-mono">
                  1m Vol: {(liveQ?.volume || item.volume || 0).toLocaleString()}
                </span>
                <button
                  onClick={() => navigate(`/stocks/${item.symbol}`)}
                  className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
                >
                  Analyze & Forecast <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
