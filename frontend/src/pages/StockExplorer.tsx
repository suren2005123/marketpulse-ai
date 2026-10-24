import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useSocket } from '../context/SocketContext.js';
import { Instrument, CataloguePagination, CatalogueStats } from '../types/index.js';
import {
  Search,
  Plus,
  Check,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  RefreshCw,
  LayoutGrid,
  List,
  AlertCircle,
  Database,
  ArrowUpDown,
} from 'lucide-react';

export const StockExplorer: React.FC = () => {
  const navigate = useNavigate();
  const { quotes } = useSocket();

  // Catalogue data state
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [pagination, setPagination] = useState<CataloguePagination>({
    page: 1,
    limit: 24,
    total: 0,
    totalPages: 1,
    exchange: 'ALL',
    search: '',
    sortBy: 'symbol',
    sortOrder: 'asc',
  });
  const [stats, setStats] = useState<CatalogueStats>({
    totalInstruments: 0,
    nseCount: 0,
    bseCount: 0,
    lastRefreshedAt: null,
  });

  // Watchlist state
  const [watchlistIds, setWatchlistIds] = useState<Set<string>>(new Set());

  // Filter & control states
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedExchange, setSelectedExchange] = useState<'ALL' | 'NSE' | 'BSE'>('ALL');
  const [sortBy, setSortBy] = useState<string>('symbol');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(24);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Request & UI states
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1); // Reset to page 1 on new search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Initial load of user watchlist
  useEffect(() => {
    async function fetchWatchlist() {
      try {
        const watchRes = await api.get('/api/watchlist').catch(() => ({ data: [] }));
        const wIds = new Set<string>((watchRes.data || []).map((w: any) => w.instrumentId));
        setWatchlistIds(wIds);
      } catch (err) {
        console.warn('Watchlist fetch notice:', err);
      }
    }
    fetchWatchlist();
  }, []);

  // Fetch paginated catalogue from backend
  const fetchCatalogue = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        search: debouncedSearch,
        exchange: selectedExchange,
        sortBy,
        sortOrder,
        page: String(page),
        limit: String(limit),
      });

      const res = await api.get(`/api/instruments/catalogue?${params.toString()}`);
      if (res && res.success) {
        setInstruments(res.data || []);
        if (res.pagination) setPagination(res.pagination);
        if (res.stats) setStats(res.stats);
      } else {
        // Fallback to legacy instruments route if catalogue endpoint is unavailable
        const legacyRes = await api.get('/api/instruments');
        setInstruments(legacyRes.data || []);
      }
    } catch (err: any) {
      console.error('Error fetching stock catalogue:', err);
      setError(err.message || 'Failed to load stock catalogue. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, selectedExchange, sortBy, sortOrder, page, limit]);

  useEffect(() => {
    fetchCatalogue();
  }, [fetchCatalogue]);

  // Watchlist toggle handler
  const handleToggleWatchlist = async (inst: Instrument) => {
    const isWatched = watchlistIds.has(inst.id);
    // Optimistic UI update
    setWatchlistIds((prev) => {
      const next = new Set(prev);
      if (isWatched) next.delete(inst.id);
      else next.add(inst.id);
      return next;
    });

    try {
      if (isWatched) {
        await api.delete(`/api/watchlist/${inst.id}`);
      } else {
        await api.post('/api/watchlist', { instrumentId: inst.id });
      }
    } catch (err: any) {
      // Rollback on error
      setWatchlistIds((prev) => {
        const rollback = new Set(prev);
        if (isWatched) rollback.add(inst.id);
        else rollback.delete(inst.id);
        return rollback;
      });
      alert(err.message || 'Error updating watchlist');
    }
  };

  // Manual catalogue refresh trigger
  const handleRefreshCatalogue = async () => {
    try {
      setIsRefreshing(true);
      await api.post('/api/instruments/refresh', {});
      await fetchCatalogue();
    } catch (err: any) {
      alert(err.message || 'Error refreshing catalogue from official masters');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Sort change handler
  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const [field, order] = e.target.value.split(':');
    setSortBy(field);
    setSortOrder((order as 'asc' | 'desc') || 'asc');
    setPage(1);
  };

  // Exchange filter tab handler
  const handleExchangeChange = (ex: 'ALL' | 'NSE' | 'BSE') => {
    setSelectedExchange(ex);
    setPage(1);
  };

  // Calculate items range display
  const startIdx = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const endIdx = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <div className="space-y-6">
      {/* Top Header & Coverage Stats */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">Stock Explorer</h1>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-950/80 text-cyan-400 border border-cyan-800/40">
              <Database className="w-3 h-3" />
              {stats.totalInstruments > 0 ? `${stats.totalInstruments.toLocaleString('en-IN')} Equities` : 'Verified Catalogue'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Browse, search and track official NSE & BSE Indian equity instruments
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh Catalogue Button */}
          <button
            onClick={handleRefreshCatalogue}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-white hover:border-slate-700 transition-all disabled:opacity-50"
            title="Synchronize latest instruments and bhavcopy snapshots"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : 'text-slate-400'}`} />
            <span className="hidden sm:inline">Sync Master</span>
          </button>

          {/* View Mode Toggle */}
          <div className="flex items-center p-1 rounded-xl bg-slate-900 border border-slate-800">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors ${
                viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Card Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition-colors ${
                viewMode === 'table' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Dense Table View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Search, Filter Tabs & Sort Controls */}
      <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/90 backdrop-blur-md flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Search Bar */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search symbol or company name (e.g. RELIANCE, TCS, Tata, HDFC)..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
          />
        </div>

        {/* Filters and Sort */}
        <div className="flex items-center gap-2 overflow-x-auto">
          {/* Exchange Filter Buttons */}
          <div className="flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800 shrink-0">
            {(['ALL', 'NSE', 'BSE'] as const).map((ex) => (
              <button
                key={ex}
                onClick={() => handleExchangeChange(ex)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  selectedExchange === ex
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {ex === 'ALL' ? 'All Exchanges' : ex}
              </button>
            ))}
          </div>

          {/* Sort Selector */}
          <div className="relative shrink-0">
            <select
              value={`${sortBy}:${sortOrder}`}
              onChange={handleSortChange}
              className="appearance-none bg-slate-950 border border-slate-800 text-xs text-slate-200 py-2.5 pl-3 pr-8 rounded-xl focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="symbol:asc">Symbol (A → Z)</option>
              <option value="symbol:desc">Symbol (Z → A)</option>
              <option value="name:asc">Name (A → Z)</option>
              <option value="price:desc">Price (High → Low)</option>
              <option value="price:asc">Price (Low → High)</option>
              <option value="changePct:desc">Change % (Top Gainers)</option>
              <option value="changePct:asc">Change % (Top Losers)</option>
              <option value="volume:desc">Volume (High → Low)</option>
            </select>
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={fetchCatalogue}
            className="px-3 py-1 rounded-lg bg-rose-900/60 hover:bg-rose-800 text-white font-semibold transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Results Count Banner */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <span>
          Showing <span className="font-semibold text-slate-200">{startIdx}–{endIdx}</span> of{' '}
          <span className="font-semibold text-slate-200">{pagination.total.toLocaleString('en-IN')}</span> instruments
          {debouncedSearch && ` matching "${debouncedSearch}"`}
        </span>
        <div className="flex items-center gap-2">
          <span>Rows per page:</span>
          <select
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1);
            }}
            className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none"
          >
            <option value="12">12</option>
            <option value="24">24</option>
            <option value="48">48</option>
            <option value="96">96</option>
          </select>
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        // Loading Skeleton
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/60 animate-pulse space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="h-4 bg-slate-800 rounded w-20" />
                <div className="h-4 bg-slate-800 rounded w-10" />
              </div>
              <div className="h-3 bg-slate-800/60 rounded w-36" />
              <div className="h-6 bg-slate-800 rounded w-24" />
              <div className="h-3 bg-slate-800/40 rounded w-full pt-2" />
            </div>
          ))}
        </div>
      ) : instruments.length === 0 ? (
        // Empty State
        <div className="p-12 text-center rounded-2xl bg-slate-900/30 border border-slate-800/60 space-y-3">
          <Database className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-base font-semibold text-white">No instruments found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {debouncedSearch
              ? `No stocks matching "${debouncedSearch}" were found in ${selectedExchange === 'ALL' ? 'NSE & BSE' : selectedExchange}.`
              : 'The instrument catalogue is currently being synchronized.'}
          </p>
          {debouncedSearch && (
            <button
              onClick={() => setSearchInput('')}
              className="px-4 py-2 rounded-xl bg-blue-600 text-xs font-semibold text-white hover:bg-blue-500 transition-colors"
            >
              Clear Search
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        // Grid View
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {instruments.map((inst) => {
            const liveTick = quotes[inst.symbol];
            const price = liveTick?.price || inst.price || 0;
            const change = liveTick?.change ?? (inst.change || 0);
            const changePct = liveTick?.changePct ?? (inst.changePct || 0);
            const isPos = change >= 0;
            const isWatched = watchlistIds.has(inst.id);
            const freshness = liveTick ? 'LIVE' : (inst.freshness || 'END_OF_DAY');

            return (
              <div
                key={inst.id}
                className="p-5 rounded-2xl glass-card border border-slate-800/90 hover:border-slate-700 hover:shadow-lg hover:shadow-cyan-950/20 transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-start justify-between mb-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-white font-mono tracking-tight">
                          {inst.symbol}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold ${
                            inst.exchange === 'NSE'
                              ? 'bg-blue-950/80 text-blue-400 border border-blue-800/40'
                              : 'bg-amber-950/80 text-amber-400 border border-amber-800/40'
                          }`}
                        >
                          {inst.exchange}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                          {freshness}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-1" title={inst.name}>
                        {inst.name}
                      </p>
                    </div>

                    <button
                      onClick={() => handleToggleWatchlist(inst)}
                      className={`p-2 rounded-xl border transition-all ${
                        isWatched
                          ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                      }`}
                      title={isWatched ? 'Remove from Watchlist' : 'Add to Watchlist'}
                    >
                      {isWatched ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Price & Change */}
                  <div className="flex items-baseline gap-2 mb-2 font-mono">
                    <span className="text-xl font-bold text-white">
                      {price > 0 ? `₹${price.toFixed(2)}` : '—'}
                    </span>
                    {price > 0 && (
                      <span
                        className={`text-xs font-semibold flex items-center ${
                          isPos ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isPos ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                        {isPos ? '+' : ''}
                        {change.toFixed(2)} ({isPos ? '+' : ''}
                        {changePct.toFixed(2)}%)
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between mt-3 text-[10px]">
                  <span className="text-slate-500 truncate max-w-[120px]">{inst.sector || 'Equities'}</span>
                  <button
                    onClick={() => navigate(`/stocks/${inst.symbol}`)}
                    className="font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform"
                  >
                    Details <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // Dense Table View
        <div className="overflow-x-auto rounded-2xl border border-slate-800/90 bg-slate-950/60 backdrop-blur-md">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800/80 bg-slate-900/50 text-slate-400 font-mono">
                <th className="py-3 px-4 font-semibold">Symbol / Name</th>
                <th className="py-3 px-4 font-semibold">Exchange</th>
                <th className="py-3 px-4 font-semibold">Sector</th>
                <th className="py-3 px-4 font-semibold text-right">Price</th>
                <th className="py-3 px-4 font-semibold text-right">Change</th>
                <th className="py-3 px-4 font-semibold text-right">Volume</th>
                <th className="py-3 px-4 font-semibold text-center">Status</th>
                <th className="py-3 px-4 font-semibold text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {instruments.map((inst) => {
                const liveTick = quotes[inst.symbol];
                const price = liveTick?.price || inst.price || 0;
                const change = liveTick?.change ?? (inst.change || 0);
                const changePct = liveTick?.changePct ?? (inst.changePct || 0);
                const isPos = change >= 0;
                const isWatched = watchlistIds.has(inst.id);
                const freshness = liveTick ? 'LIVE' : (inst.freshness || 'END_OF_DAY');

                return (
                  <tr
                    key={inst.id}
                    className="hover:bg-slate-900/40 transition-colors group cursor-pointer"
                    onClick={() => navigate(`/stocks/${inst.symbol}`)}
                  >
                    <td className="py-3 px-4">
                      <div className="font-bold text-white group-hover:text-cyan-400 transition-colors">
                        {inst.symbol}
                      </div>
                      <div className="text-[11px] text-slate-400 font-sans line-clamp-1">{inst.name}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          inst.exchange === 'NSE'
                            ? 'bg-blue-950 text-blue-400 border border-blue-800/30'
                            : 'bg-amber-950 text-amber-400 border border-amber-800/30'
                        }`}
                      >
                        {inst.exchange}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400 font-sans">{inst.sector || 'Equities'}</td>
                    <td className="py-3 px-4 text-right font-bold text-white">
                      {price > 0 ? `₹${price.toFixed(2)}` : '—'}
                    </td>
                    <td className={`py-3 px-4 text-right font-semibold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {price > 0 ? (
                        <>
                          {isPos ? '+' : ''}
                          {change.toFixed(2)} ({isPos ? '+' : ''}
                          {changePct.toFixed(2)}%)
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-400">
                      {inst.volume ? inst.volume.toLocaleString('en-IN') : '—'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                        {freshness}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleToggleWatchlist(inst)}
                        className={`p-1.5 rounded-lg border transition-all ${
                          isWatched
                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                        title={isWatched ? 'Remove from Watchlist' : 'Add to Watchlist'}
                      >
                        {isWatched ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Bar */}
      {pagination.totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-800/80">
          <div className="text-xs text-slate-400">
            Page <span className="font-semibold text-white">{pagination.page}</span> of{' '}
            <span className="font-semibold text-white">{pagination.totalPages.toLocaleString('en-IN')}</span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* First Page */}
            <button
              onClick={() => setPage(1)}
              disabled={pagination.page <= 1}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              title="First Page"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>

            {/* Prev Page */}
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pagination.page <= 1}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Previous
            </button>

            {/* Current Page Indicator */}
            <span className="px-3 py-1.5 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-400 text-xs font-bold font-mono">
              {pagination.page}
            </span>

            {/* Next Page */}
            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={pagination.page >= pagination.totalPages}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center gap-1"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>

            {/* Last Page */}
            <button
              onClick={() => setPage(pagination.totalPages)}
              disabled={pagination.page >= pagination.totalPages}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              title="Last Page"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
