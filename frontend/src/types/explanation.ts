export interface StockExplanationFact {
  category: 'PRICE_ACTION' | 'VOLUME' | 'TECHNICAL_INDICATOR' | 'DATA_PROVENANCE';
  label: string;
  value: string;
  timestamp: string;
  source: string;
}

export interface StockExplanationInterpretation {
  category: 'MOMENTUM' | 'TREND_STRENGTH' | 'RISK_SCENARIO' | 'LEVELS';
  title: string;
  description: string;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: 'HIGH' | 'MODERATE' | 'LOW';
}

export interface StockExplanationResult {
  id: string;
  symbol: string;
  exchange: string;
  instrumentName: string;
  sector: string;
  timeframe: string;
  currentPrice: number;
  trendClassification: string;
  confidenceScore: number;
  strengthLabel: string;
  generatedAt: string;
  sourceMode: string;
  beginnerSummary: string;
  advancedSummary: string;
  verifiedFacts: StockExplanationFact[];
  possibleInterpretations: StockExplanationInterpretation[];
  keySupportResistance: {
    resistance2: number;
    resistance1: number;
    pivot: number;
    support1: number;
    support2: number;
  };
  supportingIndicators: {
    rsi: number;
    rsiCondition: string;
    macdHistogram: number;
    emaAlignment: string;
    relativeVolume: number;
    atr14: number;
    roc5: number;
  };
}
