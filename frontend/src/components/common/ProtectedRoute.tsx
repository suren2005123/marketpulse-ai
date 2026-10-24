import React, { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { Activity, ServerOff, RefreshCw, LogIn } from 'lucide-react';

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading, initError, retryInit } = useAuth();
  const [timedOut, setTimedOut] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      setTimedOut(false);
      return;
    }

    const timer = setTimeout(() => {
      setTimedOut(true);
    }, 5000);

    return () => clearTimeout(timer);
  }, [loading]);

  const handleRetry = async () => {
    setRetrying(true);
    setTimedOut(false);
    try {
      await retryInit();
    } finally {
      setRetrying(false);
    }
  };

  // If loading exceeds 5s or there is an initialization error from AuthContext
  if (initError || (loading && timedOut)) {
    return (
      <div className="min-h-screen bg-[#07090e] flex flex-col items-center justify-center text-slate-400 px-4">
        <div className="w-full max-w-md p-6 rounded-2xl glass-card border border-amber-500/30 bg-slate-900/90 shadow-2xl text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mb-4">
            <ServerOff className="w-6 h-6" />
          </div>
          <h2 className="text-base font-semibold text-white mb-2">Session Initialization Notice</h2>
          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            {initError || 'The backend service at http://localhost:5000 is taking longer than expected to verify your session.'}
          </p>
          <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800 text-[11px] text-slate-400 font-mono mb-5 text-left space-y-1">
            <div className="flex justify-between">
              <span>Backend Target:</span>
              <span className="text-cyan-400">http://localhost:5000</span>
            </div>
            <div className="flex justify-between">
              <span>Vite API Proxy:</span>
              <span className="text-cyan-400">/api/auth/refresh</span>
            </div>
            <div className="flex justify-between">
              <span>Timeout SLA:</span>
              <span className="text-amber-400">5,000ms exceeded</span>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
              {retrying ? 'Retrying...' : 'Retry Connection'}
            </button>
            <button
              onClick={() => navigate('/login')}
              className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors border border-slate-700"
            >
              <LogIn className="w-3.5 h-3.5 text-cyan-400" />
              Proceed to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07090e] flex flex-col items-center justify-center text-slate-400">
        <div className="relative mb-4">
          <div className="w-12 h-12 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin"></div>
          <Activity className="w-6 h-6 text-blue-400 absolute inset-0 m-auto" />
        </div>
        <p className="text-sm font-medium tracking-wide">Initializing MarketPulse Session...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};
