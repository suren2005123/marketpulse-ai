import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useSocket } from '../context/SocketContext.js';
import { Instrument } from '../types/index.js';
import { Search, Plus, Check, TrendingUp, TrendingDown, ChevronRight, Filter } from 'lucide-react';

export const StockExplorer: React.FC = () => {
  const navigate = useNavigate();
  const { quotes } = useSocket();

  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [watchlistIds, setWatchlistIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [selectedSector, setSelectedSector] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [instRes, watchRes] = await Promise.all([
          api.get('/api/instruments'),
          api.get('/api/watchlist').catch(() => ({ data: [] })),
        ]);
        setInstruments(instRes.data || []);
        const wIds = new Set<string>((watchRes.data || []).map((w: any) => w.instrumentId));
        setWatchlistIds(wIds);
      } catch (err) {
        console.error('Error fetching instruments:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleToggleWatchlist = async (instrumentId: string) => {
    try {
      if (watchlistIds.has(instrumentId)) {
        await api.delete(`/api/watchlist/${instrumentId}`);
        setWatchlistIds((prev) => {
          const next = new Set(prev);
          next.delete(instrumentId);
          return next;
        });
      } else {
        await api.post('/api/watchlist', { instrumentId });
        setWatchlistIds((prev) => new Set(prev).add(instrumentId));
      }
    } catch (err: any) {
      alert(err.message || 'Error updating watchlist');
    }
  };

  const sectors = ['ALL', ...Array.from(new Set(instruments.map((i) => i.sector).filter(Boolean)))];

  const filtered = instruments.filter((inst) => {
    const matchesSearch =
      inst.symbol.toLowerCase().includes(search.toLowerCase()) ||
      inst.name.toLowerCase().includes(search.toLowerCase());
    const matchesSector = selectedSector === 'ALL' || inst.sector === selectedSector;
    return matchesSearch && matchesSector;
  });

  return (
    <div className="space-y-6">
      {/* Title & Search bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Stock Explorer</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Discover, track and analyze NSE & BSE Indian equities
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search symbol or name..."
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Sector filter tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <Filter className="w-3.5 h-3.5 text-slate-500 mr-1 shrink-0" />
        {sectors.map((sec) => (
          <button
            key={sec}
            onClick={() => setSelectedSector(sec as string)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
              selectedSector === sec
                ? 'bg-blue-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            {sec}
          </button>
        ))}
      </div>

      {/* Grid of stock cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((inst) => {
          const liveQ = quotes[inst.symbol];
          const price = liveQ?.price || 1500;
          const change = liveQ?.change ?? 0;
          const changePct = liveQ?.changePct ?? 0;
          const isPos = change >= 0;
          const isWatched = watchlistIds.has(inst.id);

          return (
            <div
              key={inst.id}
              className="p-5 rounded-2xl glass-card border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-white font-mono">{inst.symbol}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                        {inst.exchange}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{inst.name}</p>
                  </div>

                  <button
                    onClick={() => handleToggleWatchlist(inst.id)}
                    className={`p-2 rounded-xl border transition-all ${
                      isWatched
                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                    title={isWatched ? 'Remove from Watchlist' : 'Add to Watchlist'}
                  >
                    {isWatched ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="flex items-baseline gap-2 mb-2 font-mono">
                  <span className="text-xl font-bold text-white">₹{price.toFixed(2)}</span>
                  <span className={`text-xs font-semibold flex items-center ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isPos ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                    {isPos ? '+' : ''}
                    {change.toFixed(2)} ({isPos ? '+' : ''}
                    {changePct.toFixed(2)}%)
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between mt-4">
                <span className="text-[10px] text-slate-500">{inst.sector}</span>
                <button
                  onClick={() => navigate(`/stocks/${inst.symbol}`)}
                  className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform"
                >
                  Detail & Forecast <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
