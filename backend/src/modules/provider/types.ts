export interface TejHQStatus {
  pipeline_status: string;
  trading_date: string;
  prices_published_at: string;
  nse_records_count: number;
  bse_records_count: number;
  mode: SourceMode;
}

export type SourceMode = 'LIVE' | 'HISTORICAL_REPLAY' | 'SIMULATED' | 'END_OF_DAY';

export interface MarketTick {
  exchange: string;
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: string; // ISO 8601
  sourceMode: SourceMode;
  provider: string;
  ingestTimestamp: number; // millisecond timestamp for latency calculation
}

export interface ProviderStatus {
  provider: string;
  mode: SourceMode;
  connected: boolean;
  reconnecting: boolean;
  reconnectAttempts: number;
  lastReceivedTimestamp: string | null;
  lastExchangeTimestamp: string | null;
  consecutiveErrors: number;
  messageCount: number;
  stale: boolean;
  latencyMs: {
    p50: number;
    p95: number;
    current: number;
  };
}

export interface IMarketDataProvider {
  name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(symbols: string[]): void;
  unsubscribe(symbols: string[]): void;
  getStatus(): ProviderStatus;
  on(event: 'tick', listener: (tick: MarketTick) => void): this;
  on(event: 'status', listener: (status: ProviderStatus) => void): this;
}
