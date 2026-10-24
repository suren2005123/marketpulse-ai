export type SourceMode = 'LIVE' | 'HISTORICAL_REPLAY' | 'SIMULATED' | 'END_OF_DAY';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: string;
  createdAt?: string;
  lastLoginAt?: string;
}

export interface Instrument {
  id: string;
  exchange: string;
  symbol: string;
  name: string;
  sector?: string;
  provider_instrument_key?: string;
  isin?: string;
  active: boolean;
  price?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  prevClose?: number;
  change?: number;
  changePct?: number;
  volume?: number;
  tradingDate?: string;
  sourceMode?: SourceMode;
  freshness?: string;
}

export interface CataloguePagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  exchange: string;
  search: string;
  sortBy: string;
  sortOrder: string;
}

export interface CatalogueStats {
  totalInstruments: number;
  nseCount: number;
  bseCount: number;
  lastRefreshedAt: string | null;
}

export interface CatalogueResponse {
  success: boolean;
  data: Instrument[];
  pagination: CataloguePagination;
  stats: CatalogueStats;
}

export interface MarketQuote {
  symbol: string;
  exchange: string;
  name?: string;
  sector?: string;
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  prevClose?: number;
  change: number;
  changePct: number;
  volume: number;
  timestamp: string;
  sourceMode: SourceMode;
  provider: string;
  latencyMs?: number;
}

export interface Candle {
  id: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sourceMode?: SourceMode;
}

export interface Forecast {
  id: string;
  horizonMinutes: number;
  issuedAt: string;
  targetTime: string;
  anchorPrice: number;
  predictedPrice: number;
  lowerBound: number;
  upperBound: number;
  probabilityUp?: number;
  modelVersion: string;
  sourceMode: SourceMode;
  evaluationStatus: 'PENDING' | 'EVALUATED' | 'EXPIRED';
}

export interface ForecastHistoryItem extends Forecast {
  actualPrice?: number | null;
  absoluteError?: number | null;
  directionalCorrect?: boolean | null;
  insideInterval?: boolean | null;
}

export interface HorizonPerformance {
  sampleCount: number;
  horizonMinutes: number;
  mae: number;
  rmse: number;
  naiveMae: number;
  baselineImprovementPct: number;
  directionalAccuracyPct: number;
  intervalCoveragePct: number;
  evidenceStatus: string;
}

export interface Alert {
  id: string;
  instrumentId: string;
  symbol: string;
  exchange: string;
  name: string;
  conditionType: 'PRICE_ABOVE' | 'PRICE_BELOW' | 'PCT_CHANGE_ABOVE' | 'VOLUME_SPIKE' | 'UNCERTAINTY_WIDE' | 'FEED_STALE';
  threshold: number;
  active: boolean;
  triggeredAt: string | null;
  createdAt: string;
}

export interface TriggeredAlertNotification {
  alertId: string;
  userId: string;
  symbol: string;
  exchange: string;
  conditionType: string;
  threshold: number;
  currentValue: number;
  message: string;
  triggeredAt: string;
}

export interface FeedStatusData {
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
  hasToken?: boolean;
  accountStatus?: 'ACTIVE' | 'ACCOUNT_UNDER_REVIEW' | 'TOKEN_EXPIRED' | 'DISCONNECTED' | 'UNCONFIGURED';
  actionableMessage?: string;
  subscriptionCount?: number;
  subscriptionLimit?: number;
  activeSubscriptions?: string[];
  tradingDate?: string | null;
  lastPublishedIst?: string | null;
}
