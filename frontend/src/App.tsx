import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.js';
import { SocketProvider } from './context/SocketContext.js';
import { ProtectedRoute } from './components/common/ProtectedRoute.js';
import { AppLayout } from './components/layout/AppLayout.js';

import { Login } from './pages/Login.js';
import { SignUp } from './pages/SignUp.js';
import { Dashboard } from './pages/Dashboard.js';
import { StockExplorer } from './pages/StockExplorer.js';
import { StockDetail } from './pages/StockDetail.js';
import { ForecastPerformance } from './pages/ForecastPerformance.js';
import { Alerts } from './pages/Alerts.js';
import { Watchlist } from './pages/Watchlist.js';
import { FeedStatus } from './pages/FeedStatus.js';
import { Settings } from './pages/Settings.js';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <Routes>
            {/* Public Auth Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<SignUp />} />

            {/* Authenticated Protected Routes */}
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/explorer" element={<StockExplorer />} />
              <Route path="/stocks/:symbol" element={<StockDetail />} />
              <Route path="/performance" element={<ForecastPerformance />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/watchlist" element={<Watchlist />} />
              <Route path="/feed-status" element={<FeedStatus />} />
              <Route path="/settings" element={<Settings />} />
            </Route>

            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};
