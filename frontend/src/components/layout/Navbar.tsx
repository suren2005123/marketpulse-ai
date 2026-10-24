import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useSocket } from '../../context/SocketContext.js';
import { api } from '../../api/client.js';
import {
  Activity,
  Wifi,
  WifiOff,
  RefreshCw,
  LogOut,
  Sliders,
  ChevronDown,
  Clock,
  Sparkles,
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const { connectionStatus, reconnectAttempts, latency, feedStatus } = useSocket();
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showModeModal, setShowModeModal] = useState(false);
  const [switchingMode, setSwitchingMode] = useState(false);

  const currentMode = feedStatus?.mode || 'SIMULATED';

  const handleSwitchMode = async (mode: 'SIMULATED' | 'HISTORICAL_REPLAY' | 'LIVE' | 'END_OF_DAY', speed = 5) => {
    try {
      setSwitchingMode(true);
      await api.post('/api/system/set-mode', { mode, replaySpeed: speed });
      setShowModeModal(false);
    } catch (err: any) {
      alert(err.message || 'Failed to switch data mode');
    } finally {
      setSwitchingMode(false);
    }
  };

  const getModeBadge = () => {
    switch (currentMode) {
      case 'LIVE':
        if (feedStatus?.connected) {
          return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              LIVE (Upstox V3)
            </span>
          );
        }
        if (feedStatus?.accountStatus === 'ACCOUNT_UNDER_REVIEW') {
          return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
              UPSTOX UNDER REVIEW
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <WifiOff className="w-3 h-3 text-rose-400" />
            LIVE (DISCONNECTED)
          </span>
        );
      case 'END_OF_DAY':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
            <Clock className="w-3 h-3 text-indigo-400" />
            END OF DAY (TejHQ)
          </span>
        );
      case 'HISTORICAL_REPLAY':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <Clock className="w-3 h-3 text-amber-400" />
            HISTORICAL REPLAY
          </span>
        );
      case 'SIMULATED':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            SIMULATED MODE
          </span>
        );
    }
  };

  return (
    <>
      <header className="h-16 border-b border-slate-800 bg-[#0a0d14]/80 backdrop-blur-md sticky top-0 z-40 px-4 lg:px-6 flex items-center justify-between">
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight text-white font-mono">
                MARKET<span className="text-cyan-400">PULSE</span>.AI
              </span>
              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800/60">
                v2.0
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium">Real-Time NSE/BSE Analytics & ML</p>
          </div>
        </div>

        {/* Center: Persistent Data Mode Badge with Quick Switcher Trigger */}
        <div className="hidden sm:flex items-center gap-3">
          <button
            onClick={() => setShowModeModal(true)}
            className="group flex items-center gap-2 hover:opacity-90 transition-opacity"
            title="Click to change data source mode"
          >
            {getModeBadge()}
            <Sliders className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-200 transition-colors" />
          </button>
        </div>

        {/* Right: Latency indicator + Socket Status + User Profile */}
        <div className="flex items-center gap-3">
          {/* Real-time Socket & Latency Pill */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs font-mono">
            {connectionStatus === 'connected' ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-medium">Connected</span>
                <span className="text-slate-600">|</span>
                <span className="text-slate-300" title="End-to-end screen delivery latency p50 / p95">
                  {latency.p50}ms <span className="text-slate-500 text-[10px]">p50</span>
                </span>
              </>
            ) : connectionStatus === 'reconnecting' ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                <span className="text-amber-400 font-medium">
                  Reconnecting {reconnectAttempts > 0 ? `(${reconnectAttempts})` : ''}...
                </span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-rose-500" />
                <span className="text-rose-400 font-medium">Offline</span>
              </>
            )}
          </div>

          {/* User Profile Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowUserDropdown(!showUserDropdown)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 transition-colors text-left"
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white uppercase">
                {user?.displayName ? user.displayName[0] : 'U'}
              </div>
              <div className="hidden lg:block">
                <p className="text-xs font-semibold text-slate-200 leading-tight truncate max-w-[110px]">
                  {user?.displayName || 'Trader'}
                </p>
                <p className="text-[10px] text-slate-400 leading-none truncate max-w-[110px]">
                  {user?.email}
                </p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
            </button>

            {showUserDropdown && (
              <div className="absolute right-0 mt-2 w-52 rounded-xl bg-[#0e131f] border border-slate-800 shadow-2xl py-1 z-50">
                <div className="px-4 py-2 border-b border-slate-800">
                  <p className="text-xs font-semibold text-slate-100">{user?.displayName}</p>
                  <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
                  <span className="mt-1 inline-block text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-300 border border-blue-700/40">
                    {user?.role}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setShowUserDropdown(false);
                    setShowModeModal(true);
                  }}
                  className="w-full px-4 py-2 text-left text-xs text-slate-300 hover:bg-slate-800/60 flex items-center gap-2"
                >
                  <Sliders className="w-3.5 h-3.5 text-slate-400" />
                  Switch Data Mode
                </button>
                <button
                  onClick={() => {
                    setShowUserDropdown(false);
                    logout();
                  }}
                  className="w-full px-4 py-2 text-left text-xs text-rose-400 hover:bg-rose-500/10 flex items-center gap-2 border-t border-slate-800/60"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mode Switcher Modal */}
      {showModeModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#0e131f] border border-slate-800 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-cyan-400" />
              Select Data Feed Mode
            </h3>
            <p className="text-xs text-slate-400 mb-6">
              Switch between strict isolated data environments. Synthetic and real market data are strictly segregated.
            </p>

            <div className="space-y-3">
              {/* Simulated Mode */}
              <button
                disabled={switchingMode}
                onClick={() => handleSwitchMode('SIMULATED')}
                className={`w-full p-4 rounded-xl border text-left transition-all ${
                  currentMode === 'SIMULATED'
                    ? 'border-cyan-500/80 bg-cyan-950/20'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-900/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    SIMULATED MODE (Default)
                  </span>
                  {currentMode === 'SIMULATED' && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-900/60 text-cyan-300 font-mono">
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  Deterministic Geometric Brownian Motion tick generator with realistic volatility and volume clusters. No broker credentials required.
                </p>
              </button>

              {/* Historical Replay */}
              <button
                disabled={switchingMode}
                onClick={() => handleSwitchMode('HISTORICAL_REPLAY', 5)}
                className={`w-full p-4 rounded-xl border text-left transition-all ${
                  currentMode === 'HISTORICAL_REPLAY'
                    ? 'border-amber-500/80 bg-amber-950/20'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-900/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-400" />
                    HISTORICAL REPLAY (5x Speed)
                  </span>
                  {currentMode === 'HISTORICAL_REPLAY' && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-900/60 text-amber-300 font-mono">
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  Replays recorded historical candles while preserving relative timestamps. Useful for walk-forward testing.
                </p>
              </button>

              {/* End of Day (TejHQ Bhavcopy) */}
              <button
                disabled={switchingMode}
                onClick={() => handleSwitchMode('END_OF_DAY')}
                className={`w-full p-4 rounded-xl border text-left transition-all ${
                  currentMode === 'END_OF_DAY'
                    ? 'border-indigo-500/80 bg-indigo-950/20'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-900/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-indigo-400" />
                    END OF DAY (TejHQ Bhavcopy)
                  </span>
                  {currentMode === 'END_OF_DAY' && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-900/60 text-indigo-300 font-mono">
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  Daily closing bhavcopy snapshots from TejHQ covering 5,500+ NSE & BSE stocks. Genuine free EOD market data.
                </p>
              </button>

              {/* Live Feed */}
              <button
                disabled={switchingMode}
                onClick={() => handleSwitchMode('LIVE')}
                className={`w-full p-4 rounded-xl border text-left transition-all ${
                  currentMode === 'LIVE'
                    ? 'border-emerald-500/80 bg-emerald-950/20'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-900/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-white flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-emerald-400" />
                    LIVE AUTHORIZED FEED (Upstox V3)
                  </span>
                  {currentMode === 'LIVE' && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-300 font-mono">
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  Connects to live authorized market data feed via Upstox V3 API. Requires configured UPSTOX_ACCESS_TOKEN.
                </p>
              </button>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowModeModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
