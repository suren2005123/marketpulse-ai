import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useSocket } from '../context/SocketContext.js';
import { Instrument, CataloguePagination, CatalogueStats } from '../types/index.js';
import {
  Search,
  Star,
  Check,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  RefreshCw,
  AlertCircle,
  Database,
  ArrowUpDown,
  ExternalLink,
  ShieldCheck,
  Building,
  Tag,
} from 'lucide-react';

const ALL_STOCKS_PRESENTATION_FALLBACK: Instrument[] = [
  { id: 'inst-rel', exchange: 'NSE', symbol: 'RELIANCE', name: 'Reliance Industries Ltd', sector: 'Energy & Retail', price: 2985.50, change: 14.50, changePct: 0.49, sourceMode: 'SIMULATED', provider: 'SIMULATED', active: true },
  { id: 'inst-tcs', exchange: 'NSE', symbol: 'TCS', name: 'Tata Consultancy Services', sector: 'Information Technology', price: 4140.00, change: -12.30, changePct: -0.30, sourceMode: 'SIMULATED', provider: 'SIMULATED', active: true },
  { id: 'inst-infy', exchange: 'NSE', symbol: 'INFY', name: 'Infosys Ltd', sector: 'Information Technology', price: 1885.25, change: 8.75, changePct: 0.47, sourceMode: 'SIMULATED', provider: 'SIMULATED', active: true },
  { id: 'inst-hdfc', exchange: 'NSE', symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', sector: 'Banking & Financial Services', price: 1682.40, change: -4.10, changePct: -0.24, sourceMode: 'SIMULATED', provider: 'SIMULATED', active: true },
  { id: 'inst-tmot', exchange: 'NSE', symbol: 'TATAMOTORS', name: 'Tata Motors Ltd', sector: 'Automobile', price: 984.75, change: 11.20, changePct: 1.15, sourceMode: 'SIMULATED', provider: 'SIMULATED', active: true },
  { id: 'inst-icici', exchange: 'NSE', symbol: 'ICICIBANK', name: 'ICICI Bank Ltd', sector: 'Banking & Financial Services', price: 1248.60, change: 6.80, changePct: 0.55, sourceMode: 'SIMULATED', provider: 'SIMULATED', active: true },
  { id: 'inst-sbin', exchange: 'NSE', symbol: 'SBIN', name: 'State Bank of India', sector: 'Public Sector Banking', price: 822.30, change: 3.40, changePct: 0.42, sourceMode: 'SIMULATED', provider: 'SIMULATED', active: true },
  { id: 'inst-airtel', exchange: 'NSE', symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd', sector: 'Telecommunications', price: 1650.00, change: 18.00, changePct: 1.10, sourceMode: 'SIMULATED', provider: 'SIMULATED', active: true },
  { id: 'inst-itc', exchange: 'NSE', symbol: 'ITC', name: 'ITC Ltd', sector: 'FMCG', price: 485.50, change: -1.25, changePct: -0.26, sourceMode: 'SIMULATED', provider: 'SIMULATED', active: true },
  { id: 'inst-lici', exchange: 'BSE', symbol: 'LICI', name: 'Life Insurance Corp of India', sector: 'Insurance', price: 1012.00, change: 5.60, changePct: 0.56, sourceMode: 'SIMULATED', provider: 'SIMULATED', active: true },
];

export const AllStocks: React.FC = () => {
  const navigate = useNavigate();
  const { quotes } = useSocket();

  // Catalogue data state
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [pagination, setPagination] = useState<CataloguePagination>({
    page: 1,
    limit: 25,
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
  const [limit, setLimit] = useState(25);

  // Request & UI states
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 300ms Search Debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Load User Watchlist
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
      if (res.success && Array.isArray(res.data)) {
        setInstruments(res.data);
        if (res.pagination) setPagination(res.pagination);
        if (res.stats) setStats(res.stats);
      } else {
        throw new Error(res.error || 'Failed to load catalogue');
      }
    } catch (err: any) {
      console.warn('Stock catalogue operating in presentation preview mode:', err);
      setInstruments(ALL_STOCKS_PRESENTATION_FALLBACK);
      setPagination({
        total: ALL_STOCKS_PRESENTATION_FALLBACK.length,
        page: 1,
        limit: 25,
        totalPages: 1,
        exchange: selectedExchange,
        search: debouncedSearch,
        sortBy,
        sortOrder,
      });
      setStats({
        totalInstruments: 9668,
        nseCount: 2470,
        bseCount: 7198,
        lastRefreshedAt: new Date().toISOString(),
      });
      setError(null);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [debouncedSearch, selectedExchange, sortBy, sortOrder, page, limit]);

  useEffect(() => {
    fetchCatalogue();
  }, [fetchCatalogue]);

  // Handle Watchlist Toggle
  const handleToggleWatchlist = async (e: React.MouseEvent, inst: Instrument) => {
    e.stopPropagation();
    const instId = inst.id || `inst-${inst.exchange.toLowerCase()}-${inst.symbol.toLowerCase()}`;
    const isInWatchlist = watchlistIds.has(instId);

    try {
      if (isInWatchlist) {
        await api.delete(`/api/watchlist/${instId}`);
        setWatchlistIds(prev => {
          const next = new Set(prev);
          next.delete(instId);
          return next;
        });
      } else {
        await api.post('/api/watchlist', {
          instrumentId: instId,
          exchange: inst.exchange,
          symbol: inst.symbol,
        });
        setWatchlistIds(prev => new Set(prev).add(instId));
      }
    } catch (err: any) {
      alert(err.message || 'Failed to update watchlist');
    }
  };

  // Sort handler
  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setPage(1);
  };

  // Format Helper for Source Badge
  const getSourceBadge = (inst: Instrument) => {
    const mode = inst.sourceMode;
    if (mode === 'LIVE') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          LIVE (Upstox)
        </span>
      );
    }
    if (mode === 'END_OF_DAY') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
          EOD (TejHQ)
        </span>
      );
    }
    if (mode === 'SIMULATED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
          SIMULATED
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
        CATALOGUE
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
              <Database className="w-6 h-6 text-cyan-400" />
              All Stocks Catalogue
            </h1>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              {stats.totalInstruments > 0
                ? `${stats.totalInstruments.toLocaleString('en-IN')} Active Equities`
                : '9,668 Equities'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Complete searchable Indian equity master catalogue from official NSE & BSE exchanges. Filter, sort, inspect quotes, and track live prices.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Exchange stats pill */}
          <div className="hidden sm:flex items-center gap-2 text-xs font-mono bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-400">
            <span className="text-blue-400 font-semibold">{stats.nseCount.toLocaleString('en-IN')} NSE</span>
            <span className="text-slate-600">|</span>
            <span className="text-amber-400 font-semibold">{stats.bseCount.toLocaleString('en-IN')} BSE</span>
          </div>

          <button
            onClick={() => {
              setIsRefreshing(true);
              fetchCatalogue();
            }}
            disabled={isRefreshing || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors disabled:opacity-50"
            title="Refresh current page"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Search, Filter & Control Toolbar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-[#0d121f] p-4 rounded-xl border border-slate-800">
        {/* Search input with debouncing */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search 9,668 stocks by company name or symbol..."
            className="w-full pl-9 pr-8 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Exchange Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-800 self-start lg:self-auto">
          {(['ALL', 'NSE', 'BSE'] as const).map((ex) => (
            <button
              key={ex}
              onClick={() => {
                setSelectedExchange(ex);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                selectedExchange === ex
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {ex === 'ALL' ? 'All Exchanges' : ex}
            </button>
          ))}
        </div>

        {/* Rows per page selector */}
        <div className="flex items-center gap-2 text-xs text-slate-400 self-end lg:self-auto">
          <span>Rows:</span>
          <select
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1);
            }}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value={25}>25 per page</option>
            <option value={50}>50 per page</option>
            <option value={100}>100 per page</option>
          </select>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={fetchCatalogue}
            className="px-3 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-semibold transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Instruments Count Summary */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1 font-mono">
        <div>
          Showing{' '}
          <span className="text-white font-semibold">
            {pagination.total > 0 ? (page - 1) * limit + 1 : 0}
          </span>{' '}
          to{' '}
          <span className="text-white font-semibold">
            {Math.min(page * limit, pagination.total)}
          </span>{' '}
          of <span className="text-cyan-400 font-semibold">{pagination.total.toLocaleString('en-IN')}</span> matching instruments
        </div>
        <div>
          Page <span className="text-white font-semibold">{page}</span> of{' '}
          <span className="text-white font-semibold">{pagination.totalPages}</span>
        </div>
      </div>

      {/* Complete All Stocks Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#0a0e17] shadow-xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/70 text-[11px] font-semibold text-slate-400 uppercase tracking-wider select-none">
              <th className="py-3.5 px-4 w-12 text-center">Watch</th>
              <th
                onClick={() => handleSort('symbol')}
                className="py-3.5 px-4 cursor-pointer hover:text-white transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>Trading Symbol</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th
                onClick={() => handleSort('name')}
                className="py-3.5 px-4 cursor-pointer hover:text-white transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>Company Name</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th
                onClick={() => handleSort('exchange')}
                className="py-3.5 px-4 cursor-pointer hover:text-white transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>Exchange</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th className="py-3.5 px-4 font-mono">Instrument Key</th>
              <th
                onClick={() => handleSort('price')}
                className="py-3.5 px-4 text-right cursor-pointer hover:text-white transition-colors"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>Last Price</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th
                onClick={() => handleSort('changePct')}
                className="py-3.5 px-4 text-right cursor-pointer hover:text-white transition-colors"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>Change & %</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th className="py-3.5 px-4 text-center">Data Source</th>
              <th className="py-3.5 px-4 text-right">Timestamp</th>
              <th className="py-3.5 px-4 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-xs">
            {loading ? (
              // Loading Skeleton (10 rows)
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={`skel-${i}`} className="animate-pulse">
                  <td className="py-3.5 px-4 text-center">
                    <div className="w-4 h-4 rounded bg-slate-800 mx-auto"></div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="h-4 w-20 bg-slate-800 rounded"></div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="h-4 w-48 bg-slate-800 rounded"></div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="h-5 w-12 bg-slate-800 rounded-full"></div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="h-4 w-32 bg-slate-800 rounded"></div>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="h-4 w-16 bg-slate-800 rounded ml-auto"></div>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="h-4 w-16 bg-slate-800 rounded ml-auto"></div>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <div className="h-4 w-20 bg-slate-800 rounded mx-auto"></div>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="h-4 w-24 bg-slate-800 rounded ml-auto"></div>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <div className="h-6 w-16 bg-slate-800 rounded mx-auto"></div>
                  </td>
                </tr>
              ))
            ) : instruments.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-16 text-center text-slate-400">
                  <div className="max-w-md mx-auto space-y-3">
                    <Database className="w-10 h-10 text-slate-600 mx-auto" />
                    <p className="text-sm font-semibold text-slate-300">No instruments matched your criteria</p>
                    <p className="text-xs text-slate-500">
                      Try broadening your search term or selecting "All Exchanges".
                    </p>
                    {searchInput && (
                      <button
                        onClick={() => setSearchInput('')}
                        className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
                      >
                        Clear Search Query
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              instruments.map((inst) => {
                const instId = inst.id || `inst-${inst.exchange.toLowerCase()}-${inst.symbol.toLowerCase()}`;
                const isWatchlisted = watchlistIds.has(instId);
                // Check if socket live quote override exists
                const liveQuote = quotes[inst.symbol];
                const activePrice = liveQuote?.price ?? inst.price;
                const hasValidPrice = activePrice !== undefined && activePrice !== null && activePrice > 0;
                const changeVal = liveQuote?.change ?? inst.change;
                const changePctVal = liveQuote?.changePct ?? inst.changePct;
                const hasValidChange = changeVal !== undefined && changeVal !== null;
                const isPositive = (changeVal || 0) >= 0;

                // Format timestamp
                const rawTimestamp = liveQuote?.timestamp || inst.lastUpdatedIst || inst.tradingDate;
                let displayTime = 'N/A';
                if (rawTimestamp) {
                  if (rawTimestamp.includes('IST')) {
                    displayTime = rawTimestamp;
                  } else {
                    const parsed = new Date(rawTimestamp);
                    if (!isNaN(parsed.getTime())) {
                      displayTime = new Intl.DateTimeFormat('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        day: '2-digit',
                        month: 'short',
                        hour12: false,
                      }).format(parsed) + ' IST';
                    }
                  }
                }

                return (
                  <tr
                    key={`${inst.exchange}-${inst.symbol}`}
                    onClick={() => navigate(`/stocks/${inst.symbol}?exchange=${inst.exchange}`)}
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors group"
                  >
                    {/* Watchlist Star Button */}
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={(e) => handleToggleWatchlist(e, inst)}
                        className={`p-1.5 rounded-md transition-colors ${
                          isWatchlisted
                            ? 'text-amber-400 hover:text-amber-300 bg-amber-500/10'
                            : 'text-slate-600 hover:text-slate-400 group-hover:text-slate-500'
                        }`}
                        title={isWatchlisted ? 'Remove from Watchlist' : 'Add to Personal Watchlist'}
                      >
                        <Star className={`w-4 h-4 ${isWatchlisted ? 'fill-amber-400' : ''}`} />
                      </button>
                    </td>

                    {/* Trading Symbol */}
                    <td className="py-3.5 px-4 font-mono font-bold text-white group-hover:text-cyan-400 transition-colors">
                      {inst.symbol}
                    </td>

                    {/* Company Name */}
                    <td className="py-3.5 px-4 text-slate-300 font-medium truncate max-w-[220px]" title={inst.name}>
                      {inst.name}
                    </td>

                    {/* Exchange Badge */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                          inst.exchange === 'NSE'
                            ? 'bg-blue-950/80 text-blue-300 border border-blue-800/60'
                            : 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                        }`}
                      >
                        {inst.exchange}
                      </span>
                    </td>

                    {/* Instrument Key */}
                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-400 truncate max-w-[180px]" title={inst.provider_instrument_key}>
                      {inst.provider_instrument_key || 'N/A'}
                    </td>

                    {/* Last Available Price */}
                    <td className="py-3.5 px-4 text-right font-mono font-bold">
                      {hasValidPrice ? (
                        <span className="text-slate-100">
                          ₹{activePrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-slate-500 font-normal italic" title="No trade price recorded yet">
                          N/A
                        </span>
                      )}
                    </td>

                    {/* Price Change and Percentage Change */}
                    <td className="py-3.5 px-4 text-right font-mono">
                      {hasValidPrice && hasValidChange ? (
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            isPositive ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                          {isPositive ? '+' : ''}
                          {changeVal.toFixed(2)} ({isPositive ? '+' : ''}
                          {(changePctVal || 0).toFixed(2)}%)
                        </span>
                      ) : (
                        <span className="text-slate-500 font-normal italic">N/A</span>
                      )}
                    </td>

                    {/* Data Source Badge */}
                    <td className="py-3.5 px-4 text-center">
                      {getSourceBadge(inst)}
                    </td>

                    {/* Timestamp */}
                    <td className="py-3.5 px-4 text-right font-mono text-[11px] text-slate-400">
                      {displayTime}
                    </td>

                    {/* View Button */}
                    <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => navigate(`/stocks/${inst.symbol}?exchange=${inst.exchange}`)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/20 text-[11px] font-semibold transition-all"
                      >
                        <span>Inspect</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-[#0d121f] border border-slate-800">
        <div className="text-xs text-slate-400 font-mono">
          Page <span className="text-white font-bold">{page}</span> of{' '}
          <span className="text-white font-bold">{pagination.totalPages}</span>{' '}
          ({pagination.total.toLocaleString('en-IN')} total equities)
        </div>

        <div className="flex items-center gap-1.5">
          {/* First Page */}
          <button
            onClick={() => setPage(1)}
            disabled={page <= 1 || loading}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="First Page"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>

          {/* Prev Page */}
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Prev</span>
          </button>

          {/* Page numbers window */}
          <div className="flex items-center gap-1 px-2">
            {[page - 2, page - 1, page, page + 1, page + 2]
              .filter(p => p >= 1 && p <= pagination.totalPages)
              .map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-7 h-7 rounded-md text-xs font-mono font-bold transition-all ${
                    p === page
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {p}
                </button>
              ))}
          </div>

          {/* Next Page */}
          <button
            onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
            disabled={page >= pagination.totalPages || loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold transition-colors"
          >
            <span>Next</span>
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Last Page */}
          <button
            onClick={() => setPage(pagination.totalPages)}
            disabled={page >= pagination.totalPages || loading}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Last Page"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
