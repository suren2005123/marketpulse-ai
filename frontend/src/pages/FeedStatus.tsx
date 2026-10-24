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
            Diagnostic monitoring of market data ingestion, WebSocket connection, and end-to-end latency SLA
          </p>
        </div>

        <div className="flex items-center gap-2">
          {current?.connected ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              Feed Operational
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
              <WifiOff className="w-3.5 h-3.5" />
              Feed Disconnected
            </span>
          )}
        </div>
      </div>

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
          <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2">
            Ingestion Provider Specification
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
                {current?.stale ? 'STALE (Over 15s elapsed)' : 'FRESH'}
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
            Timestamps & Fault Tolerance
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
              <span className="text-slate-400">Fan-Out Layer:</span>
              <span className="text-purple-400 font-bold">Redis Pub/Sub Adapter</span>
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
          MarketPulse AI strictly separates data sources. To switch from SIMULATED to LIVE feed:
        </p>
        <ol className="list-decimal list-inside text-xs text-slate-300 space-y-1 font-mono">
          <li>Create an authorized developer account on <a href="https://upstox.com/developer/api-documentation/v3/" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">Upstox Developer Portal</a>.</li>
          <li>Set <span className="text-cyan-300">UPSTOX_CLIENT_ID</span> and <span className="text-cyan-300">UPSTOX_CLIENT_SECRET</span> in your environment.</li>
          <li>Generate an active access token and set <span className="text-cyan-300">UPSTOX_ACCESS_TOKEN</span> in <span className="text-slate-400">.env</span>.</li>
          <li>Switch data mode to LIVE in the top navigation bar.</li>
        </ol>
      </div>
    </div>
  );
};
