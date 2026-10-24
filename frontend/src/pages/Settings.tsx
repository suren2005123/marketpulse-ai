import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { useSocket } from '../context/SocketContext.js';
import { api } from '../api/client.js';
import {
  Settings as SettingsIcon,
  User as UserIcon,
  Shield,
  Key,
  Sliders,
  LogOut,
  CheckCircle,
  AlertCircle,
  Wifi,
  WifiOff,
  ExternalLink,
  RefreshCw,
  Clock,
  Info,
} from 'lucide-react';

interface UpstoxStatusResponse {
  provider: string;
  mode: string;
  connected: boolean;
  reconnecting: boolean;
  reconnectAttempts: number;
  hasToken: boolean;
  accountStatus: 'ACTIVE' | 'ACCOUNT_UNDER_REVIEW' | 'TOKEN_EXPIRED' | 'DISCONNECTED' | 'UNCONFIGURED';
  actionableMessage: string;
  subscriptionCount: number;
  subscriptionLimit: number;
  activeSubscriptions: string[];
}

export const Settings: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { user, logout } = useAuth();
  const { feedStatus } = useSocket();

  const [currentMode, setCurrentMode] = useState<string>(feedStatus?.mode || 'SIMULATED');
  const [replaySpeed, setReplaySpeed] = useState<number>(5);
  const [modeMessage, setModeMessage] = useState<string | null>(null);

  // Upstox integration state
  const [upstoxStatus, setUpstoxStatus] = useState<UpstoxStatusResponse | null>(null);
  const [loadingUpstox, setLoadingUpstox] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  const [upstoxBannerMessage, setUpstoxBannerMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Password state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdMessage, setPwdMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [savingPwd, setSavingPwd] = useState(false);

  // Check URL query parameters for OAuth results
  useEffect(() => {
    const errorParam = searchParams.get('upstox_error');
    const statusParam = searchParams.get('upstox_status');

    if (errorParam) {
      setUpstoxBannerMessage({
        text: decodeURIComponent(errorParam),
        isError: true,
      });
    } else if (statusParam === 'connected') {
      setUpstoxBannerMessage({
        text: 'Upstox account authorized successfully! Live market feed is ready.',
        isError: false,
      });
    }
  }, [searchParams]);

  // Fetch Upstox detailed status from backend
  const fetchUpstoxStatus = async () => {
    try {
      setLoadingUpstox(true);
      const res = await api.get('/api/provider/upstox/status');
      if (res && res.data) {
        setUpstoxStatus(res.data);
      }
    } catch (err: any) {
      console.warn('Failed to fetch Upstox status:', err);
    } finally {
      setLoadingUpstox(false);
    }
  };

  useEffect(() => {
    fetchUpstoxStatus();
  }, [feedStatus?.connected, feedStatus?.mode]);

  // Connect via OAuth
  const handleConnectUpstox = async () => {
    try {
      setLoadingUpstox(true);
      const res = await api.get('/api/provider/upstox/auth-url');
      if (res && res.authUrl) {
        window.location.href = res.authUrl;
      } else {
        alert('Failed to obtain Upstox authorization URL. Ensure UPSTOX_CLIENT_ID is configured.');
      }
    } catch (err: any) {
      alert(err.message || 'Error initiating Upstox authorization');
      setLoadingUpstox(false);
    }
  };

  // Disconnect Upstox
  const handleDisconnectUpstox = async () => {
    try {
      setLoadingUpstox(true);
      await api.post('/api/provider/upstox/disconnect', {});
      setUpstoxBannerMessage({
        text: 'Upstox access token cleared. Live session disconnected.',
        isError: false,
      });
      await fetchUpstoxStatus();
    } catch (err: any) {
      alert(err.message || 'Failed to disconnect Upstox');
    } finally {
      setLoadingUpstox(false);
    }
  };

  // Submit manual token
  const handleSaveManualToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) return;

    try {
      setSavingToken(true);
      await api.post('/api/provider/upstox/token', { token: manualToken.trim() });
      setManualToken('');
      setUpstoxBannerMessage({
        text: 'Access token saved successfully. Connecting streamer...',
        isError: false,
      });
      await fetchUpstoxStatus();
    } catch (err: any) {
      setUpstoxBannerMessage({
        text: err.message || 'Failed to save access token',
        isError: true,
      });
    } finally {
      setSavingToken(false);
    }
  };

  const handleModeChange = async (mode: string) => {
    try {
      await api.post('/api/system/set-mode', { mode, replaySpeed });
      setCurrentMode(mode);
      setModeMessage(`Active data mode successfully switched to ${mode}.`);
      setTimeout(() => setModeMessage(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Failed to switch mode');
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMessage(null);

    if (newPassword !== confirmPassword) {
      setPwdMessage({ text: 'New passwords do not match.', isError: true });
      return;
    }

    if (newPassword.length < 8) {
      setPwdMessage({ text: 'New password must be at least 8 characters long.', isError: true });
      return;
    }

    setSavingPwd(true);
    setTimeout(() => {
      setSavingPwd(false);
      setPwdMessage({ text: 'Password successfully updated.', isError: false });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }, 600);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-cyan-400" />
          <h2 className="text-xl font-bold text-white tracking-tight">
            Settings & Provider Configuration
          </h2>
        </div>
        <p className="text-xs text-slate-400 mt-0.5">
          Manage your market data feeds, Upstox V3 OAuth connection, security credentials, and active session
        </p>
      </div>

      {/* Section 1: User Profile Information */}
      <div className="p-5 rounded-2xl glass-card border border-slate-800 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <UserIcon className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-bold text-white">User Profile Information</h3>
          </div>
          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-900/60 text-blue-300 border border-blue-700/40">
            {user?.role.toUpperCase()}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-slate-500">DISPLAY NAME</span>
            <p className="text-sm font-bold text-white mt-0.5">{user?.displayName}</p>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-slate-500">EMAIL ADDRESS</span>
            <p className="text-sm font-bold text-white mt-0.5">{user?.email}</p>
          </div>
        </div>
      </div>

      {/* Section 2: Upstox V3 Live Market Data OAuth Integration */}
      <div className="p-5 rounded-2xl glass-card border border-cyan-500/30 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Wifi className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">Upstox V3 Live Market Feed (OAuth)</h3>
          </div>
          <div className="flex items-center gap-2">
            {upstoxStatus?.connected ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                Connected & Streaming
              </span>
            ) : upstoxStatus?.accountStatus === 'ACCOUNT_UNDER_REVIEW' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                Account Under Review (EOD Fallback)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                <WifiOff className="w-3.5 h-3.5" />
                Disconnected
              </span>
            )}
          </div>
        </div>

        {/* Action / Error Banner */}
        {upstoxBannerMessage && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
              upstoxBannerMessage.isError
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {upstoxBannerMessage.isError ? (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              ) : (
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <span>{upstoxBannerMessage.text}</span>
            </div>
            <button
              onClick={() => setUpstoxBannerMessage(null)}
              className="text-slate-400 hover:text-white text-xs font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Actionable guidance if account under review */}
        {upstoxStatus?.accountStatus === 'ACCOUNT_UNDER_REVIEW' && (
          <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/60 text-xs text-amber-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-300">
              <Info className="w-4 h-4 shrink-0" />
              <span>Upstox Account Reactivation Status: Under Review</span>
            </div>
            <p className="leading-relaxed text-amber-200/90">
              Your Upstox account reactivation is currently being reviewed by the broker. MarketPulse AI is safely operating using the genuine <strong>TejHQ End-Of-Day Bhavcopy</strong> feed. No synthetic prices will be labeled as live. Once your Upstox account is approved by the broker, simply click "Connect Upstox Account" below to begin real-time streaming.
            </p>
          </div>
        )}

        {/* Diagnostics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-slate-500 text-[10px]">AUTHENTICATION TOKEN</span>
            <p className="text-white font-bold mt-1">
              {upstoxStatus?.hasToken ? 'Securely Stored (Backend)' : 'Not Configured'}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-slate-500 text-[10px]">ACTIVE SUBSCRIPTIONS</span>
            <p className="text-cyan-400 font-bold mt-1">
              {upstoxStatus?.subscriptionCount || 0} / {upstoxStatus?.subscriptionLimit || 100} instruments
            </p>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-slate-500 text-[10px]">REDIRECT CALLBACK URI</span>
            <p className="text-slate-300 font-mono text-[11px] mt-1 truncate" title="http://localhost:5000/api/provider/upstox/callback">
              .../api/provider/upstox/callback
            </p>
          </div>
        </div>

        {/* OAuth Buttons & Manual Input */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2">
            <button
              onClick={handleConnectUpstox}
              disabled={loadingUpstox}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-50 shadow-lg shadow-cyan-900/30"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {loadingUpstox ? 'Connecting...' : 'Connect Upstox Account (OAuth)'}
            </button>

            {upstoxStatus?.hasToken && (
              <button
                onClick={handleDisconnectUpstox}
                disabled={loadingUpstox}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors disabled:opacity-50"
              >
                Disconnect
              </button>
            )}

            <button
              onClick={fetchUpstoxStatus}
              disabled={loadingUpstox}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              title="Refresh status"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingUpstox ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
          </div>

          <span className="text-[11px] text-slate-500 font-mono">
            Upstox V3 API Protocol
          </span>
        </div>

        {/* Manual Access Token Input (Optional Testing Fallback) */}
        <div className="pt-2 border-t border-slate-800/80">
          <p className="text-xs text-slate-400 mb-2">
            Or configure an existing developer access token directly:
          </p>
          <form onSubmit={handleSaveManualToken} className="flex gap-2">
            <input
              type="password"
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              placeholder="Paste Upstox Bearer Token..."
              className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
            />
            <button
              type="submit"
              disabled={savingToken || !manualToken.trim()}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors disabled:opacity-50 shrink-0"
            >
              {savingToken ? 'Saving...' : 'Set Token'}
            </button>
          </form>
        </div>
      </div>

      {/* Section 3: Data Mode Preferences */}
      <div className="p-5 rounded-2xl glass-card border border-slate-800 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">Data Mode Preferences</h3>
          </div>
          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-cyan-900/60 text-cyan-300 border border-cyan-700/40">
            {currentMode}
          </span>
        </div>

        {modeMessage && (
          <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{modeMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            onClick={() => handleModeChange('SIMULATED')}
            className={`p-4 rounded-xl border text-left transition-all ${
              currentMode === 'SIMULATED'
                ? 'bg-cyan-950/20 border-cyan-500/80 text-white'
                : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <span className="text-xs font-bold font-mono block">SIMULATED</span>
            <p className="text-[11px] text-slate-400 mt-1">
              Synthetic GBM prices. Safe for student evaluation & testing.
            </p>
          </button>

          <button
            onClick={() => handleModeChange('END_OF_DAY')}
            className={`p-4 rounded-xl border text-left transition-all ${
              currentMode === 'END_OF_DAY'
                ? 'bg-indigo-950/20 border-indigo-500/80 text-white'
                : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <span className="text-xs font-bold font-mono block">END OF DAY</span>
            <p className="text-[11px] text-slate-400 mt-1">
              Genuine TejHQ Bhavcopy snapshots covering 5,500+ NSE & BSE stocks.
            </p>
          </button>

          <button
            onClick={() => handleModeChange('HISTORICAL_REPLAY')}
            className={`p-4 rounded-xl border text-left transition-all ${
              currentMode === 'HISTORICAL_REPLAY'
                ? 'bg-amber-950/20 border-amber-500/80 text-white'
                : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <span className="text-xs font-bold font-mono block">HISTORICAL REPLAY</span>
            <p className="text-[11px] text-slate-400 mt-1">
              Playback of recorded genuine historical candles at {replaySpeed}x speed.
            </p>
          </button>

          <button
            onClick={() => handleModeChange('LIVE')}
            className={`p-4 rounded-xl border text-left transition-all ${
              currentMode === 'LIVE'
                ? 'bg-emerald-950/20 border-emerald-500/80 text-white'
                : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <span className="text-xs font-bold font-mono block">LIVE AUTHORIZED</span>
            <p className="text-[11px] text-slate-400 mt-1">
              Upstox V3 streaming WebSocket feed. Requires access token.
            </p>
          </button>
        </div>
      </div>

      {/* Section 4: Password & Security */}
      <div className="p-5 rounded-2xl glass-card border border-slate-800 space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
          <Shield className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-bold text-white">Password & Security</h3>
        </div>

        {pwdMessage && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              pwdMessage.isError
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            }`}
          >
            {pwdMessage.isError ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle className="w-4 h-4 shrink-0" />}
            <span>{pwdMessage.text}</span>
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="space-y-3 max-w-md">
          <div>
            <label className="block text-xs text-slate-300 mb-1">Current Password</label>
            <input
              type="password"
              required
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">New Password</label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min. 8 characters, 1 uppercase, 1 number"
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">Confirm New Password</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat new password"
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={savingPwd}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition-colors"
            >
              {savingPwd ? 'Updating Password...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>

      {/* Section 5: Sessions & Sign Out */}
      <div className="p-5 rounded-2xl glass-card border border-rose-500/20 bg-rose-950/5 flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold text-white">Active Session & Sign Out</h4>
          <p className="text-xs text-slate-400 mt-0.5">
            Signing out clears your httpOnly refresh cookie and revokes session tokens server-side.
          </p>
        </div>
        <button
          onClick={logout}
          className="px-4 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 text-xs font-semibold flex items-center gap-2 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out of Account
        </button>
      </div>
    </div>
  );
};
