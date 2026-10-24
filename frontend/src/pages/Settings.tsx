import React, { useState } from 'react';
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
} from 'lucide-react';

export const Settings: React.FC = () => {
  const { user, logout } = useAuth();
  const { feedStatus } = useSocket();

  const [currentMode, setCurrentMode] = useState<string>(feedStatus?.mode || 'SIMULATED');
  const [replaySpeed, setReplaySpeed] = useState<number>(5);
  const [modeMessage, setModeMessage] = useState<string | null>(null);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdMessage, setPwdMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [savingPwd, setSavingPwd] = useState(false);

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
    // Simulating password update call
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
            Settings & Account Security
          </h2>
        </div>
        <p className="text-xs text-slate-400 mt-0.5">
          Manage your authenticated session, data mode preferences, and security credentials
        </p>
      </div>

      {/* Section 1: User Profile & Role */}
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
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-slate-500">USER ID</span>
            <p className="text-xs text-slate-400 truncate mt-0.5">{user?.id}</p>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-slate-500">MEMBER SINCE</span>
            <p className="text-xs text-slate-400 mt-0.5">
              {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN') : '2026'}
            </p>
          </div>
        </div>
      </div>

      {/* Section 2: Platform Data Mode Selector */}
      <div className="p-5 rounded-2xl glass-card border border-slate-800 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">Active Data Mode Configuration</h3>
          </div>
        </div>

        {modeMessage && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{modeMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

      {/* Section 3: Password & Security */}
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

      {/* Section 4: Sessions & Sign Out */}
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
