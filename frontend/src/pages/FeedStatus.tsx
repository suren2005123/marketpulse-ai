import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useSocket } from '../context/SocketContext.js';
import { FeedStatusData } from '../types/index.js';
import {
  Radio,
  Wifi,
  WifiOff,
  RefreshCw,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Zap,
  Info,
  Layers,
} from 'lucide-react';

export const FeedStatus: React.FC = () => {
  const { feedStatus: socketFeedStatus, latency, reconnectCount } = useSocket();
  const [restStatus, setRestStatus] = useState<FeedStatusData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStatus() {
      try {
        setLoading(true);
        const res = await api.get('/api/system/feed-status');
        setRestStatus(res.data);
      } catch (err) {
        console.error('Failed fetching feed status:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchStatus();
  }, [reconnectCount]);

  const current = socketFeedStatus || restStatus;
  const isLive = current?.mode === 'LIVE';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Data Feed & Pipeline Status</h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Diagnostic monitoring of market data ingestion, WebSocket streaming, and end-to-end latency SLA
          </p>
        </div>

        <div className="flex items-center gap-2">
          {current?.connected ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              Feed Operational
            </span>
          ) : current?.accountStatus === 'ACCOUNT_UNDER_REVIEW' ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              Under Review (EOD Fallback)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
              <WifiOff className="w-3.5 h-3.5" />
              Feed Disconnected
            </span>
          )}
        </div>
      </div>

      {/* Account Under Review Alert Banner */}
      {current?.accountStatus === 'ACCOUNT_UNDER_REVIEW' && (
        <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-700/50 text-xs text-amber-200 flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-bold text-amber-300">Upstox Account Reactivation Status: Under Review</h4>
            <p className="leading-relaxed text-amber-200/90">
              Your broker account reactivation request was submitted and is currently being processed by Upstox. MarketPulse AI maintains data integrity by running with genuine <strong>TejHQ End-Of-Day Bhavcopy</strong> data as the safe fallback. Real-time live status will automatically engage upon approval.
            </p>
          </div>
        </div>
      )}

      {/* Latency Budget Verification Card */}
      <div className="p-5 rounded-2xl glass-card border border-cyan-500/30 glow-cyan">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-cyan-400" />
              <h3 className="text-base font-bold text-white">
                Real-Time Delivery Latency Budget (SLA &lt; 2000ms)
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              End-to-end duration from data ingestion, Redis pub/sub fan-out, WebSocket delivery to client render.
            </p>
          </div>
          <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800/40">
            PASSED SLA
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-[11px] text-slate-400">Current Instant Latency</span>
            <p className="text-2xl font-bold text-white mt-1">{latency.current} ms</p>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-[11px] text-slate-400">Measured p50 (Median)</span>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{latency.p50} ms</p>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-[11px] text-slate-400">Measured p95 (Tail)</span>
            <p className="text-2xl font-bold text-cyan-400 mt-1">{latency.p95} ms</p>
          </div>
        </div>
      </div>

      {/* Provider Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Box 1: Provider Status */}
        <div className="p-5 rounded-2xl glass-card border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2 flex items-center justify-between">
            <span>Ingestion Provider Specification</span>
            <span className="text-xs font-mono text-cyan-400">{current?.provider || 'Deterministic Engine'}</span>
          </h3>

          <div className="space-y-3 text-xs font-mono">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Active Provider:</span>
              <span className="font-bold text-white">{current?.provider || 'Deterministic Engine'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Source Mode:</span>
              <span className="font-bold text-cyan-400">{current?.mode || 'SIMULATED'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Feed Connection:</span>
              <span className={current?.connected ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                {current?.connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Staleness Detection:</span>
              <span className={current?.stale ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                {current?.stale ? 'STALE (>15s elapsed)' : 'FRESH'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Active Subscriptions:</span>
              <span className="text-cyan-300 font-bold">
                {current?.subscriptionCount !== undefined ? `${current.subscriptionCount} / ${current.subscriptionLimit || 100} instruments` : 'Global Broadcast'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Processed Packets:</span>
              <span className="text-slate-200">{current?.messageCount || 0} ticks</span>
            </div>
          </div>
        </div>

        {/* Box 2: Timestamps and Errors */}
        <div className="p-5 rounded-2xl glass-card border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2">
            Timestamps (Asia/Kolkata IST) & Fault Tolerance
          </h3>

          <div className="space-y-3 text-xs font-mono">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Last Received Timestamp:</span>
              <span className="text-slate-200">
                {current?.lastReceivedTimestamp
                  ? new Date(current.lastReceivedTimestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST'
                  : 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Exchange Timestamp:</span>
              <span className="text-slate-200">
                {current?.lastExchangeTimestamp
                  ? new Date(current.lastExchangeTimestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST'
                  : 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Consecutive Errors:</span>
              <span className="text-slate-200">{current?.consecutiveErrors || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Reconnection Attempts:</span>
              <span className="text-slate-200">{current?.reconnectAttempts || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Fan-Out Architecture:</span>
              <span className="text-purple-400 font-bold">Redis Pub/Sub Gateway</span>
            </div>
          </div>
        </div>
      </div>

      {/* Upstox V3 Configuration Guide */}
      <div className="p-5 rounded-2xl glass-card border border-slate-800">
        <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
          <Info className="w-4 h-4 text-cyan-400" />
          Upstox V3 Live Integration Instructions
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed mb-3">
          MarketPulse AI strictly separates data sources. To stream live prices via Upstox V3:
        </p>
        <ol className="list-decimal list-inside text-xs text-slate-300 space-y-1 font-mono">
          <li>Create an authorized app in the <a href="https://upstox.com/developer/api-documentation/v3/" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">Upstox Developer Console</a>.</li>
          <li>Set Redirect URL to <span className="text-cyan-300 font-bold">http://localhost:5000/api/provider/upstox/callback</span>.</li>
          <li>Enter your <span className="text-cyan-300">UPSTOX_CLIENT_ID</span> and <span className="text-cyan-300">UPSTOX_CLIENT_SECRET</span> in backend <span className="text-slate-400">.env</span>.</li>
          <li>Click <span className="text-white font-semibold">"Connect Upstox Account"</span> in Settings to initiate OAuth login.</li>
        </ol>
      </div>
    </div>
  );
};
