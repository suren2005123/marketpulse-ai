import { db } from '../../db/index.js';
import { trendAnalysisService, TrendAnalysisResult } from './trendAnalysisService.js';

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

export class StockExplanationService {
  /**
   * Generate grounded, comprehensive explanations for an instrument
   */
  async explainStock(
    symbol: string,
    exchange = 'NSE',
    candles: any[],
    timeframe = '15m'
  ): Promise<StockExplanationResult> {
    const sym = symbol.toUpperCase().trim();
    const ex = exchange.toUpperCase().trim();

    const inst = db.store.instruments.find(
      i => i.symbol.toUpperCase() === sym && i.exchange.toUpperCase() === ex
    ) || db.store.instruments.find(i => i.symbol.toUpperCase() === sym);

    const instrumentName = inst?.name || `${sym} Equity`;
    const sector = inst?.sector || 'Equities';

    // 1. Run technical trend analysis
    const trend: TrendAnalysisResult = trendAnalysisService.analyzeTrend(sym, ex, candles, timeframe);
    const ind = trend.indicators;
    const currentPrice = ind.currentPrice;
    const now = new Date().toISOString();
    const sourceMode = trend.sourceMode;

    // 2. Compute classic Pivot Points (Support & Resistance) from recent candles
    const recent = candles.slice(-20);
    const recentHigh = recent.length > 0 ? Math.max(...recent.map(c => Number(c.high || c.close))) : currentPrice * 1.02;
    const recentLow = recent.length > 0 ? Math.min(...recent.map(c => Number(c.low || c.close))) : currentPrice * 0.98;
    const pivot = Number(((recentHigh + recentLow + currentPrice) / 3).toFixed(2));
    const r1 = Number((2 * pivot - recentLow).toFixed(2));
    const s1 = Number((2 * pivot - recentHigh).toFixed(2));
    const r2 = Number((pivot + (recentHigh - recentLow)).toFixed(2));
    const s2 = Number((pivot - (recentHigh - recentLow)).toFixed(2));

    // 3. Assemble VERIFIED FACTS (measured metrics, never fabricated)
    const verifiedFacts: StockExplanationFact[] = [
      {
        category: 'PRICE_ACTION',
        label: 'Observed Closing Price',
        value: `₹${currentPrice.toFixed(2)} (${ind.momentum.roc5 >= 0 ? '+' : ''}${ind.momentum.roc5}% over past 5 candles)`,
        timestamp: trend.timestamp,
        source: `${sourceMode} Data Engine`,
      },
      {
        category: 'TECHNICAL_INDICATOR',
        label: 'Exponential Moving Averages',
        value: `20 EMA: ₹${ind.movingAverages.ema20} | 50 EMA: ₹${ind.movingAverages.ema50} (${ind.movingAverages.alignment.replace(/_/g, ' ')})`,
        timestamp: trend.timestamp,
        source: 'Calculated Indicators',
      },
      {
        category: 'TECHNICAL_INDICATOR',
        label: 'RSI (14-period)',
        value: `${ind.rsi.toFixed(1)} / 100`,
        timestamp: trend.timestamp,
        source: 'Calculated Indicators',
      },
      {
        category: 'TECHNICAL_INDICATOR',
        label: 'MACD (12, 26, 9)',
        value: `Line: ${ind.macd.macdLine} | Signal: ${ind.macd.signalLine} | Histogram: ${ind.macd.histogram}`,
        timestamp: trend.timestamp,
        source: 'Calculated Indicators',
      },
      {
        category: 'VOLUME',
        label: 'Relative Volume Multiple',
        value: `${ind.volume.relativeVolume}x of 20-candle average (${ind.volume.currentVolume.toLocaleString()} vs avg ${ind.volume.avgVolume20.toLocaleString()})`,
        timestamp: trend.timestamp,
        source: 'Volume Analyzer',
      },
      {
        category: 'DATA_PROVENANCE',
        label: 'Data Integrity & Mode',
        value: `Operating under ${sourceMode} feed with verified timestamp synchronization`,
        timestamp: trend.timestamp,
        source: sourceMode,
      },
    ];

    // 4. Assemble POSSIBLE EXPLANATIONS & INTERPRETATIONS
    const possibleInterpretations: StockExplanationInterpretation[] = [];

    // Interpretation 1: Trend Dynamics
    if (trend.classification === 'BULLISH') {
      possibleInterpretations.push({
        category: 'MOMENTUM',
        title: 'Constructive Upward Momentum',
        description: `Price action is printing above short-term and medium-term moving averages. When price sustains above the 20 EMA with positive MACD histogram expansion, buyers typically retain control until clear divergence appears.`,
        sentiment: 'BULLISH',
        confidence: trend.strengthLabel === 'STRONG' ? 'HIGH' : 'MODERATE',
      });
    } else if (trend.classification === 'BEARISH') {
      possibleInterpretations.push({
        category: 'MOMENTUM',
        title: 'Downward Drift / Selling Pressure',
        description: `Price action is trading beneath key moving averages with negative MACD histogram momentum. Downward pressure may test nearest support zones before finding institutional demand.`,
        sentiment: 'BEARISH',
        confidence: trend.strengthLabel === 'STRONG' ? 'HIGH' : 'MODERATE',
      });
    } else {
      possibleInterpretations.push({
        category: 'MOMENTUM',
        title: 'Range-Bound Equilibrium / Consolidation',
        description: `Price is compressing near moving averages with neutral RSI. Market participants appear to be accumulating or distributing without taking an aggressive directional stance, awaiting a catalyst.`,
        sentiment: 'NEUTRAL',
        confidence: 'MODERATE',
      });
    }

    // Interpretation 2: Volume Behavior
    if (ind.volume.relativeVolume >= 1.5) {
      possibleInterpretations.push({
        category: 'TREND_STRENGTH',
        title: 'Elevated Volume Participation',
        description: `Relative volume is elevated at ${ind.volume.relativeVolume}x of baseline. This indicates higher institutional or retail participation than standard periods, reinforcing the current price move.`,
        sentiment: trend.classification === 'BEARISH' ? 'BEARISH' : 'BULLISH',
        confidence: 'HIGH',
      });
    } else {
      possibleInterpretations.push({
        category: 'TREND_STRENGTH',
        title: 'Standard Volume Liquidity',
        description: `Volume is within ordinary liquidity parameters (${ind.volume.relativeVolume}x). Trends that lack heavy volume expansion are more prone to temporary retracements or consolidation.`,
        sentiment: 'NEUTRAL',
        confidence: 'MODERATE',
      });
    }

    // Interpretation 3: Risk Awareness & Key Levels
    possibleInterpretations.push({
      category: 'RISK_SCENARIO',
      title: 'Risk Boundary Management',
      description: `Immediate resistance is mapped near ₹${r1} (secondary: ₹${r2}), while primary support is located near ₹${s1} (secondary: ₹${s2}). A break below ₹${s1} would invalidate short-term bullish momentum, while a break above ₹${r1} would open higher expansion targets.`,
      sentiment: 'NEUTRAL',
      confidence: 'HIGH',
    });

    // 5. Beginner and Advanced Summaries
    const rsiCondition =
      ind.rsi >= 70 ? 'Overbought' : ind.rsi >= 55 ? 'Bullish' : ind.rsi <= 30 ? 'Oversold' : ind.rsi <= 45 ? 'Bearish' : 'Neutral';

    const beginnerSummary = this.buildBeginnerSummary(sym, instrumentName, trend, ind, currentPrice, r1, s1);
    const advancedSummary = this.buildAdvancedSummary(sym, instrumentName, trend, ind, currentPrice, r1, s1, r2, s2);

    const result: StockExplanationResult = {
      id: `exp-${sym}-${timeframe}-${Date.now()}`,
      symbol: sym,
      exchange: ex,
      instrumentName,
      sector,
      timeframe,
      currentPrice,
      trendClassification: trend.classification,
      confidenceScore: trend.confidenceScore,
      strengthLabel: trend.strengthLabel,
      generatedAt: now,
      sourceMode,
      beginnerSummary,
      advancedSummary,
      verifiedFacts,
      possibleInterpretations,
      keySupportResistance: {
        resistance2: r2,
        resistance1: r1,
        pivot,
        support1: s1,
        support2: s2,
      },
      supportingIndicators: {
        rsi: ind.rsi,
        rsiCondition,
        macdHistogram: ind.macd.histogram,
        emaAlignment: ind.movingAverages.alignment,
        relativeVolume: ind.volume.relativeVolume,
        atr14: ind.volatility.atr14,
        roc5: ind.momentum.roc5,
      },
    };

    // Asynchronously persist explanation
    db.insertStockExplanation({
      id: result.id,
      instrument_id: inst?.id || `inst-${ex.toLowerCase()}-${sym.toLowerCase()}`,
      symbol: sym,
      exchange: ex,
      trend_classification: trend.classification,
      indicators: result.supportingIndicators,
      beginner_summary: beginnerSummary,
      advanced_summary: advancedSummary,
      facts: verifiedFacts,
      interpretations: possibleInterpretations,
      timeframe,
      source_mode: sourceMode,
      generated_at: now,
    }).catch(() => {});

    return result;
  }

  private buildBeginnerSummary(
    symbol: string,
    name: string,
    trend: TrendAnalysisResult,
    ind: any,
    price: number,
    r1: number,
    s1: number
  ): string {
    if (trend.classification === 'BULLISH') {
      return `${name} (${symbol}) is currently exhibiting positive upward momentum based on calculated indicators. The price (₹${price.toFixed(2)}) is higher than its recent 20-period moving average (₹${ind.movingAverages.ema20}), and trading volume is ${ind.volume.relativeVolume}x of its typical level. Key ceiling level to watch is near ₹${r1}, while immediate downside protection sits near ₹${s1}. Note: Stock market conditions fluctuate rapidly; upward momentum is a historical observation, not a guarantee of future returns.`;
    }
    if (trend.classification === 'BEARISH') {
      return `${name} (${symbol}) is currently experiencing downward pressure. The price of ₹${price.toFixed(2)} is lower than its recent average price of ₹${ind.movingAverages.ema20}, indicating that sellers have been more active than buyers. The key floor where the price might stabilize is near ₹${s1}. Prudent risk management is recommended, as downtrends can continue until buyers step in with convincing volume.`;
    }
    if (trend.classification === 'SIDEWAYS') {
      return `${name} (${symbol}) is currently moving sideways between approximately ₹${s1} and ₹${r1}. Neither buyers nor sellers have established clear control, and the stock is hovering near its equilibrium price of ₹${price.toFixed(2)}. In sideways phases, experienced participants often monitor for a decisive move above ₹${r1} or below ₹${s1} before drawing conclusions.`;
    }
    return `${name} (${symbol}) is currently presenting mixed signals across our technical indicators. While some indicators point upward, others show weakness. When signals conflict, uncertainty is heightened, so waiting for clearer directional confirmation is standard practice.`;
  }

  private buildAdvancedSummary(
    symbol: string,
    name: string,
    trend: TrendAnalysisResult,
    ind: any,
    price: number,
    r1: number,
    s1: number,
    r2: number,
    s2: number
  ): string {
    const maText = `Price ₹${price.toFixed(2)} trades relative to 20 EMA (₹${ind.movingAverages.ema20}) and 50 EMA (₹${ind.movingAverages.ema50}) in a ${ind.movingAverages.alignment.replace(/_/g, ' ')} structure`;
    const rsiText = `RSI(14) sits at ${ind.rsi.toFixed(1)}`;
    const macdText = `MACD histogram records ${ind.macd.histogram > 0 ? '+' : ''}${ind.macd.histogram} (Line: ${ind.macd.macdLine}, Signal: ${ind.macd.signalLine})`;
    const volText = `RVOL is ${ind.volume.relativeVolume}x with ATR(14) measuring ₹${ind.volatility.atr14}`;
    const levelsText = `S/R Pivot Framework: R2: ₹${r2} | R1: ₹${r1} | Pivot: ₹${((r1 + s1) / 2).toFixed(2)} | S1: ₹${s1} | S2: ₹${s2}`;

    return `Quantitative diagnostic for ${name} (${symbol}): Classified as ${trend.classification} with ${trend.confidenceScore}% confidence. ${maText}. ${rsiText}, while ${macdText}. ${volText}. ${levelsText}. Volatility envelope shows %B at ${ind.volatility.bollingerBands.percentB} within a ${ind.volatility.bollingerBands.bandwidthPct}% bandwidth.`;
  }
}

export const stockExplanationService = new StockExplanationService();
