import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext.js';
import { getAccessToken } from '../api/client.js';
import { MarketQuote, Candle, Forecast, FeedStatusData, TriggeredAlertNotification } from '../types/index.js';

interface LatencyMetrics {
  current: number;
  p50: number;
  p95: number;
}

interface SocketContextType {
  socket: Socket | null;
  connectionStatus: 'connected' | 'reconnecting' | 'disconnected';
  reconnectAttempts: number;
  latency: LatencyMetrics;
  quotes: Record<string, MarketQuote>;
  latestCandle: Candle | null;
  latestForecasts: Record<string, Forecast[]>;
  feedStatus: FeedStatusData | null;
  triggeredAlerts: TriggeredAlertNotification[];
  clearTriggeredAlert: (alertId: string) => void;
  reconnectCount: number; // Increment on every reconnect so pages can trigger REST resync!
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, refreshSession } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('disconnected');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [reconnectCount, setReconnectCount] = useState(0);

  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>({});
  const [latestCandle, setLatestCandle] = useState<Candle | null>(null);
  const [latestForecasts, setLatestForecasts] = useState<Record<string, Forecast[]>>({});
  const [feedStatus, setFeedStatus] = useState<FeedStatusData | null>(null);
  const [triggeredAlerts, setTriggeredAlerts] = useState<TriggeredAlertNotification[]>([]);

  const latencyHistoryRef = useRef<number[]>([]);
  const [latency, setLatency] = useState<LatencyMetrics>({ current: 18, p50: 22, p95: 42 });

  const recordLatency = useCallback((ms: number) => {
    latencyHistoryRef.current.push(ms);
    if (latencyHistoryRef.current.length > 100) {
      latencyHistoryRef.current.shift();
    }
    const sorted = [...latencyHistoryRef.current].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(0.5 * sorted.length)] || ms;
    const p95 = sorted[Math.min(Math.floor(0.95 * sorted.length), sorted.length - 1)] || ms;

    setLatency({
      current: ms,
      p50,
      p95,
    });
  }, []);

  const clearTriggeredAlert = (alertId: string) => {
    setTriggeredAlerts(prev => prev.filter(a => a.alertId !== alertId));
  };

  useEffect(() => {
    if (!isAuthenticated) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      setConnectionStatus('disconnected');
      return;
    }

    const token = getAccessToken();
    const newSocket = io({
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 10000,
    });

    setSocket(newSocket);
    setConnectionStatus('reconnecting');

    newSocket.on('connect', () => {
      console.log('[Socket] Connected to real-time gateway with authenticated session.');
      setConnectionStatus('connected');
      setReconnectAttempts(0);
      setReconnectCount(prev => prev + 1); // Triggers REST state resync!
    });

    newSocket.on('disconnect', (reason) => {
      console.warn(`[Socket] Disconnected (${reason}). Reconnecting with backoff...`);
      setConnectionStatus('reconnecting');
    });

    newSocket.on('reconnect_attempt', (attempt) => {
      setConnectionStatus('reconnecting');
      setReconnectAttempts(attempt);
    });

    newSocket.on('connect_error', async (err: any) => {
      console.warn('[Socket] Connection error:', err.message);
      if (err.message && err.message.includes('Authentication error')) {
        // Access token expired, attempt silent token refresh and update socket auth
        const refreshed = await refreshSession();
        if (refreshed) {
          const newToken = getAccessToken();
          newSocket.auth = { token: newToken };
          newSocket.connect();
        }
      }
    });

    // Market data event listeners
    newSocket.on('market:update', (quote: MarketQuote) => {
      if (quote.latencyMs) {
        recordLatency(quote.latencyMs);
      }
      setQuotes(prev => ({
        ...prev,
        [quote.symbol]: quote,
      }));
    });

    newSocket.on('candle:closed', (candle: Candle) => {
      setLatestCandle(candle);
    });

    newSocket.on('forecast:update', (data: { symbol: string; forecasts: Forecast[] }) => {
      setLatestForecasts(prev => ({
        ...prev,
        [data.symbol]: data.forecasts,
      }));
    });

    newSocket.on('provider:status', (status: FeedStatusData) => {
      setFeedStatus(status);
    });

    newSocket.on('alert:triggered', (alertEvent: TriggeredAlertNotification) => {
      console.log('[Socket Notification] Alert triggered:', alertEvent);
      setTriggeredAlerts(prev => [alertEvent, ...prev.slice(0, 9)]);
    });

    return () => {
      newSocket.disconnect();
    };
  }, [isAuthenticated, recordLatency]);

  return (
    <SocketContext.Provider
      value={{
        socket,
        connectionStatus,
        reconnectAttempts,
        latency,
        quotes,
        latestCandle,
        latestForecasts,
        feedStatus,
        triggeredAlerts,
        clearTriggeredAlert,
        reconnectCount,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export function useSocket(): SocketContextType {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}
