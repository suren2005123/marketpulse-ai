import React from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar.js';
import { Sidebar } from './Sidebar.js';
import { useSocket } from '../../context/SocketContext.js';
import { Bell, X, AlertTriangle } from 'lucide-react';

export const AppLayout: React.FC = () => {
  const { connectionStatus, reconnectAttempts, triggeredAlerts, clearTriggeredAlert } = useSocket();

  return (
    <div className="min-h-screen bg-[#07090e] flex flex-col font-sans">
      <Navbar />

      {/* Disconnection/Reconnecting Warning Banner */}
      {connectionStatus !== 'connected' && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 animate-bounce" />
            <span>
              {connectionStatus === 'reconnecting'
                ? `Real-time WebSocket disconnected. Reconnecting with exponential backoff (attempt #${reconnectAttempts})... REST APIs remain active.`
                : 'Real-time WebSocket offline. Please verify backend server connectivity.'}
            </span>
          </div>
          <span className="text-[11px] font-mono text-amber-400/80 hidden sm:inline">
            REST Fallback Active
          </span>
        </div>
      )}

      {/* Real-Time User Alerts Toast Stack */}
      {triggeredAlerts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
          {triggeredAlerts.slice(0, 3).map((a) => (
            <div
              key={a.alertId}
              className="pointer-events-auto p-4 rounded-xl glass-card border border-rose-500/40 glow-red shadow-2xl flex items-start gap-3 bg-[#111723]/95 animate-slide-in"
            >
              <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4 animate-ring" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-400 uppercase tracking-wide">
                    Alert Triggered: {a.symbol}
                  </span>
                  <button
                    onClick={() => clearTriggeredAlert(a.alertId)}
                    className="text-slate-500 hover:text-slate-300"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-xs text-slate-200 mt-1 leading-snug">{a.message}</p>
                <p className="text-[10px] text-slate-500 mt-1 font-mono">
                  {new Date(a.triggeredAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-20 md:pb-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
