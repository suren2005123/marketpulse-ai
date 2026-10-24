import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useSocket } from '../context/SocketContext.js';
import {
  Radar,
  Activity,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Volume2,
  Sliders,
  Search,
  Filter,
  RefreshCw,
  Clock,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Settings,
  X,
  Plus,
  Trash2,
  Info,
  Calendar,
} from 'lucide-react';

interface AnomalyMetricBreakdown {
  dailyReturnPct: number;
  returnZScore: number;
  volume: number;
  volumeMovingAverage: number;
  volumeSpikeRatio: number;
  intradaySpreadPct: number;
  volatilityZScore: number;
  sectorDivergencePct: number;
  sectorName: string;
  sectorAverageReturnPct: number;
}

interface DetectedAnomaly {
  id: string;
  symbol: string;
  exchange: 'NSE' | 'BSE';
  name: string;
  sector: string;
  score: number;
  severity: 'CRITICAL' | 'ELEVATED' | 'MODERATE';
  anomalyType: 'PRICE_SPIKE' | 'VOLUME_SURGE' | 'VOLATILITY_BURST' | 'SECTOR_DIVERGENCE' | 'COMPOSITE';
  primaryReason: string;
  metrics: AnomalyMetricBreakdown;
  baselinePeriod: string;
  timestamp: string;
  tradingDate: string;
  sourceMode: string;
  freshness: string;
  isWatchlisted?: boolean;
}

interface BacktestStats {
  evaluationDate: string;
  totalInstrumentsScanned: number;
  anomaliesDetected: number;
  criticalCount: number;
  elevatedCount: number;
  moderateCount: number;
  truePositiveCount: number;
  falsePositiveCount: number;
  precisionRatePct: number;
  falsePositiveRatePct: number;
  averageFollowThroughReturnPct: number;
  baselineWindowDays: number;
}

interface WatchlistRule {
  id: string;
  symbol?: string;
  exchange?: string;
  returnZThreshold: number;
  volumeSpikeMultiplier: number;
  volatilityThreshold: number;
  sectorDivergenceThreshold: number;
  severityMin: string;
  active: boolean;
  createdAt: string;
}

export const AnomalyRadar: React.FC = () => {
  const navigate = useNavigate();
  const { feedStatus } = useSocket();

  const [anomalies, setAnomalies] = useState<DetectedAnomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Scan metadata
  const [scanMetadata, setScanMetadata] = useState<{
    timestamp: string;
    dataSource: string;
    scanMode: 'EOD' | 'INTRADAY';
    totalScanned: number;
    summary: { criticalCount: number; elevatedCount: number; moderateCount: number; topSector: string };
  }>({
    timestamp: new Date().toISOString(),
    dataSource: 'TejHQ EOD Official Master',
    scanMode: 'EOD',
    totalScanned: 0,
    summary: { criticalCount: 0, elevatedCount: 0, moderateCount: 0, topSector: 'Equities' },
  });

  // Filters
  const [exchangeFilter, setExchangeFilter] = useState<'ALL' | 'NSE' | 'BSE'>('ALL');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'CRITICAL' | 'ELEVATED' | 'MODERATE'>('ALL');
  const [scanMode, setScanMode] = useState<'EOD' | 'INTRADAY'>('EOD');
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Backtesting & Rules Modals
  const [backtestStats, setBacktestStats] = useState<BacktestStats | null>(null);
  const [showBacktestModal, setShowBacktestModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [userRules, setUserRules] = useState<WatchlistRule[]>([]);
  const [newRuleZ, setNewRuleZ] = useState(2.5);
  const [newRuleVol, setNewRuleVol] = useState(3.0);
  const [selectedAnomalyDetail, setSelectedAnomalyDetail] = useState<DetectedAnomaly | null>(null);

  const isLiveConnected = feedStatus?.mode === 'LIVE' && feedStatus?.connected === true;

  // Execute radar scan
  const executeScan = useCallback(async () => {
    try {
      setIsScanning(true);
      setError(null);

      const params = new URLSearchParams({
        exchange: exchangeFilter,
        severity: severityFilter,
        scanMode: scanMode === 'INTRADAY' && isLiveConnected ? 'INTRADAY' : 'EOD',
        watchlistOnly: String(watchlistOnly),
        search: searchQuery,
      });

      const res = await api.get(`/api/radar/scan?${params.toString()}`);
      if (res.success) {
        setAnomalies(res.anomalies || []);
        setScanMetadata({
          timestamp: res.timestamp,
          dataSource: res.dataSource,
          scanMode: res.scanMode,
          totalScanned: res.totalScanned,
          summary: res.summary,
        });
      } else {
        throw new Error(res.error || 'Radar scan failed');
      }
    } catch (err: any) {
      console.error('Radar scan error:', err);
      setError(err.message || 'Failed to complete Anomaly Radar scan');
    } finally {
      setIsScanning(false);
      setLoading(false);
    }
  }, [exchangeFilter, severityFilter, scanMode, watchlistOnly, searchQuery, isLiveConnected]);

  useEffect(() => {
    executeScan();
  }, [executeScan]);

  // Load backtest stats
  const fetchBacktestStats = async () => {
    try {
      const res = await api.get('/api/radar/backtest?days=30');
      if (res.success && res.data) {
        setBacktestStats(res.data);
        setShowBacktestModal(true);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to compute backtest metrics');
    }
  };

  // Load rules
  const fetchRules = async () => {
    try {
      const res = await api.get('/api/radar/rules');
      if (res.success) {
        setUserRules(res.data || []);
        setShowRulesModal(true);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to load anomaly rules');
    }
  };

  // Create rule
  const handleCreateRule = async () => {
    try {
      const res = await api.post('/api/radar/rules', {
        returnZThreshold: newRuleZ,
        volumeSpikeMultiplier: newRuleVol,
        volatilityThreshold: 2.0,
        sectorDivergenceThreshold: 3.0,
        severityMin: 'ELEVATED',
      });
      if (res.success) {
        setUserRules(prev => [...prev, res.data]);
        alert('Watchlist anomaly rule saved successfully.');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to save rule');
    }
  };

  // Delete rule
  const handleDeleteRule = async (id: string) => {
    try {
      await api.delete(`/api/radar/rules/${id}`);
      setUserRules(prev => prev.filter(r => r.id !== id));
    } catch (err: any) {
      alert(err.message || 'Failed to delete rule');
    }
  };

  const getSeverityBadge = (severity: DetectedAnomaly['severity']) => {
    switch (severity) {
      case 'CRITICAL':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse"></span>
            CRITICAL
          </span>
        );
      case 'ELEVATED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            ELEVATED
          </span>
        );
      case 'MODERATE':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/30">
            MODERATE
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Radar className="w-5 h-5 text-white animate-spin-slow" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
                MarketPulse Anomaly Radar
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                  FLAGSHIP
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Statistically deterministic surveillance across 9,668 NSE/BSE equities. Scans price return Z-scores, volume spikes, and sector divergences.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={fetchBacktestStats}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium border border-slate-800 transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Alert Quality & Backtest</span>
          </button>

          <button
            onClick={fetchRules}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium border border-slate-800 transition-colors"
          >
            <Settings className="w-3.5 h-3.5 text-cyan-400" />
            <span>Watchlist Rules</span>
          </button>

          <button
            onClick={executeScan}
            disabled={isScanning}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-600/20 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Scanning...' : 'Rescan Instruments'}</span>
          </button>
        </div>
      </div>

      {/* Surveillance Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Anomalies */}
        <div className="p-4 rounded-xl bg-[#0c101c] border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Anomalies Detected</span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {anomalies.length}
            <span className="text-xs font-normal text-slate-500 ml-2">
              of {scanMetadata.totalScanned.toLocaleString('en-IN')} scanned
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 font-mono">
            Source: <span className="text-slate-300">{scanMetadata.dataSource}</span>
          </div>
        </div>

        {/* Critical Anomalies */}
        <div className="p-4 rounded-xl bg-[#0c101c] border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Critical Severity (Z &gt; 3.5σ / Vol &gt; 5x)</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-rose-400">
            {scanMetadata.summary.criticalCount}
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            Requires priority fundamental move investigation
          </div>
        </div>

        {/* Elevated Anomalies */}
        <div className="p-4 rounded-xl bg-[#0c101c] border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Elevated Severity (Z &gt; 2.5σ / Vol &gt; 3x)</span>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-400">
            {scanMetadata.summary.elevatedCount}
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            High institutional flow or benchmark divergence
          </div>
        </div>

        {/* Top Diverging Sector */}
        <div className="p-4 rounded-xl bg-[#0c101c] border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Top Anomaly Cluster Sector</span>
            <Volume2 className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-lg font-bold text-white truncate" title={scanMetadata.summary.topSector}>
            {scanMetadata.summary.topSector}
          </div>
          <div className="mt-2 text-[11px] text-slate-400 font-mono">
            {scanMetadata.scanMode === 'INTRADAY' ? 'Intraday Live Stream' : 'Official EOD Bhavcopy'}
          </div>
        </div>
      </div>

      {/* Scan Mode & Filters Toolbar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-[#0d121f] p-4 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Scan Mode Switcher */}
          <div className="flex items-center bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setScanMode('EOD')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                scanMode === 'EOD'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              EOD Bhavcopy Scan
            </button>
            <button
              onClick={() => {
                if (!isLiveConnected) {
                  alert('Intraday scans require genuine live Upstox V3 streaming data. Currently standing by on EOD Bhavcopy data.');
                  return;
                }
                setScanMode('INTRADAY');
              }}
              className={`px-3 py-1.5 rounded-md font-semibold transition-all flex items-center gap-1.5 ${
                scanMode === 'INTRADAY'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              } ${!isLiveConnected ? 'opacity-60 cursor-not-allowed' : ''}`}
              title={!isLiveConnected ? 'Requires active Upstox V3 live connection' : 'Scan live intraday order flow'}
            >
              {isLiveConnected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>}
              Intraday Live Scan
            </button>
          </div>

          {/* Exchange Filter */}
          <div className="flex items-center bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
            {(['ALL', 'NSE', 'BSE'] as const).map(ex => (
              <button
                key={ex}
                onClick={() => setExchangeFilter(ex)}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                  exchangeFilter === ex ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {ex}
              </button>
            ))}
          </div>

          {/* Severity Filter */}
          <div className="flex items-center bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
            {(['ALL', 'CRITICAL', 'ELEVATED', 'MODERATE'] as const).map(sev => (
              <button
                key={sev}
                onClick={() => setSeverityFilter(sev)}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                  severityFilter === sev ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>

          {/* Watchlist Filter Toggle */}
          <button
            onClick={() => setWatchlistOnly(!watchlistOnly)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all flex items-center gap-1.5 ${
              watchlistOnly
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            <span>Watchlist Only</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search anomaly by symbol or name..."
            className="w-full pl-9 pr-8 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Anomalies Grid / Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading || isScanning ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={`anom-skel-${i}`} className="p-5 rounded-xl bg-[#0c101c] border border-slate-800 animate-pulse space-y-3">
              <div className="h-5 w-24 bg-slate-800 rounded"></div>
              <div className="h-4 w-40 bg-slate-800 rounded"></div>
              <div className="h-16 w-full bg-slate-800/60 rounded"></div>
            </div>
          ))
        ) : anomalies.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-400 bg-[#0c101c] rounded-xl border border-slate-800">
            <ShieldCheck className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-200">No Statistical Anomalies Detected</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              All monitored equities are trading within normal 20-day statistical distribution thresholds.
            </p>
          </div>
        ) : (
          anomalies.map((anom) => {
            const isPos = anom.metrics.dailyReturnPct >= 0;
            return (
              <div
                key={anom.id}
                className="group relative p-5 rounded-xl bg-[#0c101c] border border-slate-800 hover:border-slate-700 transition-all shadow-md hover:shadow-cyan-950/20 flex flex-col justify-between"
              >
                <div>
                  {/* Card Header: Symbol & Severity */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold font-mono text-white group-hover:text-cyan-400 transition-colors">
                          {anom.symbol}
                        </span>
                        <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                          {anom.exchange}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 font-medium truncate max-w-[180px]" title={anom.name}>
                        {anom.name}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      {getSeverityBadge(anom.severity)}
                      <span className="text-[11px] font-mono text-slate-400">
                        Score <strong className="text-cyan-400">{anom.score}</strong>/100
                      </span>
                    </div>
                  </div>

                  {/* Primary Reason Text */}
                  <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/80 text-[11px] text-slate-300 leading-relaxed my-3">
                    {anom.primaryReason}
                  </div>

                  {/* Detailed Metric Pills */}
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono my-3">
                    <div className="p-2 rounded bg-slate-900/40 border border-slate-800/60">
                      <span className="text-[10px] text-slate-500 block uppercase">Return & Z-Score</span>
                      <span className={`font-bold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isPos ? '+' : ''}{anom.metrics.dailyReturnPct.toFixed(2)}%
                        <span className="text-slate-400 font-normal ml-1">({anom.metrics.returnZScore > 0 ? '+' : ''}{anom.metrics.returnZScore}σ)</span>
                      </span>
                    </div>

                    <div className="p-2 rounded bg-slate-900/40 border border-slate-800/60">
                      <span className="text-[10px] text-slate-500 block uppercase">Volume Spike</span>
                      <span className="font-bold text-amber-400">
                        {anom.metrics.volumeSpikeRatio}x{' '}
                        <span className="text-[10px] text-slate-500 font-normal">20d MA</span>
                      </span>
                    </div>

                    <div className="p-2 rounded bg-slate-900/40 border border-slate-800/60">
                      <span className="text-[10px] text-slate-500 block uppercase">Sector Divergence</span>
                      <span className="font-bold text-slate-200">
                        {anom.metrics.sectorDivergencePct > 0 ? '+' : ''}{anom.metrics.sectorDivergencePct.toFixed(1)}%
                        <span className="text-[10px] text-slate-500 font-normal block truncate" title={anom.sector}>
                          vs {anom.sector}
                        </span>
                      </span>
                    </div>

                    <div className="p-2 rounded bg-slate-900/40 border border-slate-800/60">
                      <span className="text-[10px] text-slate-500 block uppercase">Intraday Volatility</span>
                      <span className="font-bold text-slate-200">
                        {anom.metrics.intradaySpreadPct.toFixed(2)}%
                        <span className="text-[10px] text-slate-500 font-normal ml-1">Spread</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Footer: Metadata & Action Buttons */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-mono text-[10px] text-slate-500">
                    {anom.tradingDate} • {anom.freshness}
                  </span>

                  <button
                    onClick={() =>
                      navigate(
                        `/investigator?symbol=${anom.symbol}&exchange=${anom.exchange}&date=${anom.tradingDate}`
                      )
                    }
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/20 text-xs font-semibold transition-all"
                  >
                    <span>Investigate</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Backtest & Alert Quality Modal */}
      {showBacktestModal && backtestStats && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl bg-[#0e131f] border border-slate-800 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                Alert Quality & Historical Backtesting
              </h3>
              <button
                onClick={() => setShowBacktestModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-5 leading-relaxed">
              Evaluating the statistical persistence and false-positive characteristics of detected anomalies over a 30-day baseline testing window across 9,668 equities.
            </p>

            <div className="grid grid-cols-2 gap-3 font-mono text-xs mb-6">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-400 text-[11px] block">Precision Rate</span>
                <span className="text-xl font-bold text-emerald-400">{backtestStats.precisionRatePct}%</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">True positive continuation</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-400 text-[11px] block">False-Positive Rate</span>
                <span className="text-xl font-bold text-amber-400">{backtestStats.falsePositiveRatePct}%</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Immediate mean-reversion</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-400 text-[11px] block">True Positives</span>
                <span className="text-lg font-bold text-white">{backtestStats.truePositiveCount} anomalies</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Follow-through &gt; 1.5σ</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-400 text-[11px] block">Avg Forward Move</span>
                <span className="text-lg font-bold text-cyan-400">+{backtestStats.averageFollowThroughReturnPct}%</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">3-day average drift</span>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setShowBacktestModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Watchlist Anomaly Rules Modal */}
      {showRulesModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl bg-[#0e131f] border border-slate-800 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-cyan-400" />
                Custom Watchlist Anomaly Rules
              </h3>
              <button onClick={() => setShowRulesModal(false)} className="text-slate-400 hover:text-white text-sm">
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-4">
              Configure personal anomaly triggers for your watchlisted stocks. The radar will highlight items matching these thresholds.
            </p>

            {/* Existing Rules List */}
            <div className="space-y-2 mb-6 max-h-48 overflow-y-auto">
              {userRules.map(rule => (
                <div
                  key={rule.id}
                  className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div className="font-mono">
                    <span className="text-cyan-400 font-bold">Z &gt; {rule.returnZThreshold}σ</span>
                    <span className="text-slate-500 mx-2">|</span>
                    <span className="text-amber-400 font-bold">Vol &gt; {rule.volumeSpikeMultiplier}x</span>
                    <span className="text-slate-500 mx-2">|</span>
                    <span className="text-slate-300">Min {rule.severityMin}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                    title="Delete rule"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Create New Rule Form */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 mb-5 space-y-3">
              <h4 className="text-xs font-bold text-slate-200">Add New Anomaly Trigger Rule</h4>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-slate-400 text-[11px] block mb-1">Return Z-Score Threshold</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1.0"
                    max="5.0"
                    value={newRuleZ}
                    onChange={(e) => setNewRuleZ(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-[11px] block mb-1">Volume Spike Multiplier</label>
                  <input
                    type="number"
                    step="0.5"
                    min="1.5"
                    max="10.0"
                    value={newRuleVol}
                    onChange={(e) => setNewRuleVol(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white"
                  />
                </div>
              </div>

              <button
                onClick={handleCreateRule}
                className="w-full mt-2 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Save Watchlist Anomaly Rule</span>
              </button>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setShowRulesModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
