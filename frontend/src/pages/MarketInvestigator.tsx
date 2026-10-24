import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import {
  Search,
  Sparkles,
  Calendar,
  Clock,
  ShieldCheck,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Volume2,
  FileText,
  Building,
  CheckCircle2,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  Database,
  ArrowLeft,
  Share2,
} from 'lucide-react';

interface VerifiedCorporateEvent {
  id: string;
  timestamp: string;
  timeFormattedIst: string;
  category: string;
  title: string;
  summary: string;
  source: string;
  sourceUrl?: string;
  verificationStatus: string;
}

interface SectorPeerComparison {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  volume: number;
  correlation: number;
}

interface AIReport {
  executiveSummary: string;
  measuredQuantitativeEvidence: {
    priceMove: {
      open: number;
      high: number;
      low: number;
      close: number;
      prevClose: number;
      returnPct: number;
      returnZScore: number;
      intradaySpreadPct: number;
    };
    volumeDynamics: {
      volume: number;
      baseline30dVolume: number;
      spikeMultiplier: number;
      volumeZScore: number;
    };
    sectorBenchmark: {
      sectorName: string;
      sectorAverageReturnPct: number;
      divergencePct: number;
    };
  };
  verifiedFacts: Array<{
    statement: string;
    source: string;
    timestamp: string;
  }>;
  hypothesesVsFacts: {
    verifiedFacts: string[];
    marketHypotheses: string[];
  };
  causalAssessment: {
    conclusiveness: 'DEFINITIVE_CAUSE_ESTABLISHED' | 'PROBABLE_CAUSE' | 'CAUSE_CANNOT_BE_ESTABLISHED';
    explanation: string;
  };
  disclaimer: string;
}

interface InvestigationData {
  symbol: string;
  exchange: 'NSE' | 'BSE';
  name: string;
  sector: string;
  inspectionDate: string;
  dataSource: string;
  freshness: string;
  timeline: VerifiedCorporateEvent[];
  sectorPeers: SectorPeerComparison[];
  aiReport: AIReport;
}

export const MarketInvestigator: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const initialSymbol = searchParams.get('symbol') || 'RELIANCE';
  const initialExchange = searchParams.get('exchange') || 'NSE';
  const initialDate = searchParams.get('date') || new Date().toISOString().split('T')[0];

  const [symbol, setSymbol] = useState(initialSymbol);
  const [exchange, setExchange] = useState(initialExchange);
  const [date, setDate] = useState(initialDate);

  const [stockInput, setStockInput] = useState(initialSymbol);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InvestigationData | null>(null);

  const fetchInvestigation = useCallback(async (sym: string, ex: string, dt: string) => {
    try {
      setLoading(true);
      setError(null);

      const res = await api.get(`/api/investigate/${ex}/${sym}?date=${dt}`);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        throw new Error(res.error || 'Failed to complete investigation');
      }
    } catch (err: any) {
      console.error('Investigation error:', err);
      setError(err.message || 'Failed to retrieve investigation data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvestigation(symbol, exchange, date);
  }, [symbol, exchange, date, fetchInvestigation]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockInput.trim()) return;
    const cleanSym = stockInput.trim().toUpperCase();
    setSymbol(cleanSym);
    setSearchParams({ symbol: cleanSym, exchange, date });
  };

  const getConclusivenessBadge = (status: AIReport['causalAssessment']['conclusiveness']) => {
    switch (status) {
      case 'DEFINITIVE_CAUSE_ESTABLISHED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Definitive Causal Link Verified
          </span>
        );
      case 'PROBABLE_CAUSE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <HelpCircle className="w-3.5 h-3.5" />
            Probable / Co-Factor Driver
          </span>
        );
      case 'CAUSE_CANNOT_BE_ESTABLISHED':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
            <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
            Cause Cannot Be Definitively Established
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
            <button
              onClick={() => navigate('/radar')}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors border border-slate-800"
              title="Back to Anomaly Radar"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
                <Sparkles className="w-6 h-6 text-cyan-400" />
                Market Move Investigator
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Quantitative deep-dive and evidence-based causal explanation for statistically unusual price and volume events.
              </p>
            </div>
          </div>
        </div>

        {/* Search Controls */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={stockInput}
              onChange={(e) => setStockInput(e.target.value)}
              placeholder="Stock symbol (e.g. TCS)"
              className="pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white uppercase font-mono w-32 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <select
            value={exchange}
            onChange={(e) => {
              setExchange(e.target.value);
              setSearchParams({ symbol, exchange: e.target.value, date });
            }}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
          >
            <option value="NSE">NSE</option>
            <option value="BSE">BSE</option>
          </select>

          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setSearchParams({ symbol, exchange, date: e.target.value });
            }}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
          />

          <button
            type="submit"
            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            Investigate
          </button>
        </form>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchInvestigation(symbol, exchange, date)}
            className="px-3 py-1 rounded bg-rose-500/20 text-rose-300 font-semibold"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center space-y-3">
          <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs text-slate-400 font-mono">Analyzing price distributions, volume ratios, and verified exchange filings...</p>
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Header Card: Stock Identity & Move Summary */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-[#0c111e] to-[#080c14] border border-slate-800 shadow-xl">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl font-bold font-mono text-white">{data.symbol}</span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800/60 font-semibold">
                    {data.exchange}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    {data.sector}
                  </span>
                </div>
                <h2 className="text-sm font-semibold text-slate-300 mt-1">{data.name}</h2>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right font-mono">
                  <div className="text-2xl font-bold text-white">
                    ₹{data.aiReport.measuredQuantitativeEvidence.priceMove.close.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <div
                    className={`text-xs font-semibold flex items-center justify-end gap-1 ${
                      data.aiReport.measuredQuantitativeEvidence.priceMove.returnPct >= 0
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {data.aiReport.measuredQuantitativeEvidence.priceMove.returnPct >= 0 ? '+' : ''}
                    {data.aiReport.measuredQuantitativeEvidence.priceMove.returnPct.toFixed(2)}%
                    <span className="text-slate-400 font-normal">
                      ({data.aiReport.measuredQuantitativeEvidence.priceMove.returnZScore > 0 ? '+' : ''}
                      {data.aiReport.measuredQuantitativeEvidence.priceMove.returnZScore}σ)
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => navigate(`/stocks/${data.symbol}`)}
                  className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors flex items-center gap-1.5"
                >
                  <span>Interactive Chart</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* AI Executive Summary Callout */}
            <div className="mt-5 p-4 rounded-xl bg-cyan-950/20 border border-cyan-800/40">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5 font-mono">
                  <Sparkles className="w-4 h-4" />
                  Plain-Language AI Explanation
                </span>
                {getConclusivenessBadge(data.aiReport.causalAssessment.conclusiveness)}
              </div>
              <p className="text-xs text-slate-200 leading-relaxed font-sans">
                {data.aiReport.executiveSummary}
              </p>
              <div className="mt-3 pt-3 border-t border-cyan-900/40 text-[11px] text-slate-400">
                <strong className="text-slate-300">Causal Assessment: </strong>
                {data.aiReport.causalAssessment.explanation}
              </div>
            </div>
          </div>

          {/* Measured Quantitative Evidence & Peer Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 cols: Evidence breakdown */}
            <div className="lg:col-span-2 space-y-6">
              {/* Evidence Metrics Table */}
              <div className="p-5 rounded-xl bg-[#0c101c] border border-slate-800 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
                  <Database className="w-4 h-4 text-cyan-400" />
                  Measured Quantitative Metrics vs 30-Day Baseline
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                  <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Daily Return</span>
                    <span className={`text-base font-bold ${data.aiReport.measuredQuantitativeEvidence.priceMove.returnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {data.aiReport.measuredQuantitativeEvidence.priceMove.returnPct >= 0 ? '+' : ''}
                      {data.aiReport.measuredQuantitativeEvidence.priceMove.returnPct}%
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {data.aiReport.measuredQuantitativeEvidence.priceMove.returnZScore}σ deviation
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Volume Multiplier</span>
                    <span className="text-base font-bold text-amber-400">
                      {data.aiReport.measuredQuantitativeEvidence.volumeDynamics.spikeMultiplier}x
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      vs {data.aiReport.measuredQuantitativeEvidence.volumeDynamics.baseline30dVolume.toLocaleString('en-IN')} baseline
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Sector Divergence</span>
                    <span className="text-base font-bold text-slate-200">
                      {data.aiReport.measuredQuantitativeEvidence.sectorBenchmark.divergencePct > 0 ? '+' : ''}
                      {data.aiReport.measuredQuantitativeEvidence.sectorBenchmark.divergencePct}%
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5 truncate" title={data.sector}>
                      vs {data.sector} ({data.aiReport.measuredQuantitativeEvidence.sectorBenchmark.sectorAverageReturnPct}%)
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Intraday Range</span>
                    <span className="text-base font-bold text-slate-200">
                      {data.aiReport.measuredQuantitativeEvidence.priceMove.intradaySpreadPct}%
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      High: ₹{data.aiReport.measuredQuantitativeEvidence.priceMove.high} / Low: ₹{data.aiReport.measuredQuantitativeEvidence.priceMove.low}
                    </span>
                  </div>
                </div>
              </div>

              {/* Facts vs Hypotheses Separation */}
              <div className="p-5 rounded-xl bg-[#0c101c] border border-slate-800 shadow-sm space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Fact vs Hypothesis Strict Segregation
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {/* Verified Facts */}
                  <div className="p-4 rounded-xl bg-emerald-950/15 border border-emerald-800/30 space-y-2">
                    <h4 className="text-[11px] font-bold text-emerald-400 uppercase tracking-wide flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Verified Facts (Documented &amp; Recorded)
                    </h4>
                    <ul className="space-y-2 text-slate-300">
                      {data.aiReport.hypothesesVsFacts.verifiedFacts.map((fact, idx) => (
                        <li key={idx} className="flex items-start gap-2 leading-relaxed">
                          <span className="text-emerald-400 mt-0.5">•</span>
                          <span>{fact}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Market Hypotheses */}
                  <div className="p-4 rounded-xl bg-amber-950/15 border border-amber-800/30 space-y-2">
                    <h4 className="text-[11px] font-bold text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5" />
                      Market Hypotheses (Unverified Possibilities)
                    </h4>
                    <ul className="space-y-2 text-slate-300">
                      {data.aiReport.hypothesesVsFacts.marketHypotheses.length > 0 ? (
                        data.aiReport.hypothesesVsFacts.marketHypotheses.map((hyp, idx) => (
                          <li key={idx} className="flex items-start gap-2 leading-relaxed">
                            <span className="text-amber-400 mt-0.5">•</span>
                            <span>{hyp}</span>
                          </li>
                        ))
                      ) : (
                        <li className="text-slate-500 italic">No speculative market hypotheses generated. Evidence is purely fundamental.</li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Chronological Event Timeline */}
              <div className="p-5 rounded-xl bg-[#0c101c] border border-slate-800 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-400" />
                  Chronological Verified Exchange Filings &amp; Announcements
                </h3>

                {data.timeline.length === 0 ? (
                  <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800 text-xs text-slate-400 text-center">
                    <FileText className="w-6 h-6 text-slate-600 mx-auto mb-1.5" />
                    <p className="font-semibold text-slate-300">No verified exchange filings submitted on this date</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      In accordance with data integrity principles, no simulated or unverified news articles are displayed.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.timeline.map((evt) => (
                      <div
                        key={evt.id}
                        className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-200">{evt.title}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800/60">
                            {evt.category}
                          </span>
                        </div>
                        <p className="text-slate-400 leading-relaxed text-[11px]">{evt.summary}</p>
                        <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 font-mono">
                          <span>Source: {evt.source}</span>
                          <span>{evt.timeFormattedIst}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right col: Sector Peers Table & Compliance */}
            <div className="space-y-6">
              {/* Sector Peer Comparison Table */}
              <div className="p-5 rounded-xl bg-[#0c101c] border border-slate-800 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                  <Building className="w-4 h-4 text-blue-400" />
                  {data.sector} Peer Comparison
                </h3>

                <div className="divide-y divide-slate-800/60 text-xs font-mono">
                  {data.sectorPeers.map(peer => {
                    const isPos = peer.changePct >= 0;
                    return (
                      <div
                        key={peer.symbol}
                        onClick={() => {
                          setSymbol(peer.symbol);
                          setStockInput(peer.symbol);
                          setSearchParams({ symbol: peer.symbol, exchange: 'NSE', date });
                        }}
                        className="py-2.5 flex items-center justify-between hover:bg-slate-800/30 cursor-pointer px-1 rounded transition-colors"
                      >
                        <div>
                          <div className="font-bold text-white">{peer.symbol}</div>
                          <div className="text-[10px] text-slate-500 truncate max-w-[120px]">{peer.name}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-slate-300">₹{peer.price.toFixed(2)}</div>
                          <div className={isPos ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                            {isPos ? '+' : ''}{peer.changePct.toFixed(2)}%
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Regulatory & Safety Disclaimer */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
                <h4 className="font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                  Regulatory Integrity &amp; Safety Standard
                </h4>
                <p className="text-[10px] text-slate-500">
                  {data.aiReport.disclaimer}
                </p>
                <div className="mt-3 pt-2 border-t border-slate-800 text-[10px] font-mono text-slate-500">
                  Data Engine: {data.dataSource}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
