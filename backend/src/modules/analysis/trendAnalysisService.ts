import { db } from '../../db/index.js';

export interface IndicatorMetrics {
  currentPrice: number;
  rsi: number;
  macd: {
    macdLine: number;
    signalLine: number;
    histogram: number;
    crossover: 'BULLISH_CROSS' | 'BEARISH_CROSS' | 'ABOVE_SIGNAL' | 'BELOW_SIGNAL' | 'NEUTRAL';
  };
  movingAverages: {
    sma20: number;
    sma50: number;
    ema20: number;
    ema50: number;
    priceVsEma20Pct: number;
    priceVsEma50Pct: number;
    alignment: 'STRONG_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONG_BEARISH';
  };
  volume: {
    currentVolume: number;
    avgVolume20: number;
    relativeVolume: number; // e.g. 1.5x
    volumeTrend: 'SURGING' | 'ABOVE_AVERAGE' | 'NORMAL' | 'LOW';
  };
  volatility: {
    atr14: number;
    atrPct: number;
    bollingerBands: {
      upper: number;
      middle: number;
      lower: number;
      bandwidthPct: number;
      percentB: number;
    };
  };
  momentum: {
    roc5: number; // Rate of change 5-candle
    roc14: number;
    momentumDirection: 'EXPANDING_UP' | 'SLOWING_UP' | 'FLAT' | 'SLOWING_DOWN' | 'EXPANDING_DOWN';
  };
}

export type TrendClassification = 'BULLISH' | 'BEARISH' | 'SIDEWAYS' | 'MIXED / UNCERTAIN';

export interface TrendAnalysisResult {
  id: string;
  symbol: string;
  exchange: string;
  timeframe: string;
  timestamp: string;
  sourceMode: string;
  classification: TrendClassification;
  confidenceScore: number; // 0 - 100
  strengthLabel: 'STRONG' | 'MODERATE' | 'WEAK' | 'UNCERTAIN';
  summary: string;
  beginnerExplanation: string;
  advancedExplanation: string;
  indicators: IndicatorMetrics;
  evidence: Array<{
    indicator: string;
    verdict: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    weight: number;
    detail: string;
  }>;
  historicalComparison: {
    previousClassification: TrendClassification;
    shiftDetected: boolean;
    trendDurationCandles: number;
  };
}

/**
 * Technical Indicator Calculation Utilities
 */
export function calculateSMA(data: number[], period: number): number {
  if (data.length < period) return data[data.length - 1] || 0;
  const slice = data.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return Number((sum / period).toFixed(2));
}

export function calculateEMA(data: number[], period: number): number {
  if (data.length < period) return data[data.length - 1] || 0;
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return Number(ema.toFixed(2));
}

export function calculateEMASeries(data: number[], period: number): number[] {
  if (data.length < period) return data.map(() => data[data.length - 1] || 0);
  const k = 2 / (period + 1);
  const result: number[] = [];
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = 0; i < period - 1; i++) {
    result.push(data[i]);
  }
  result.push(ema);
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

export function calculateRSI(closes: number[], period = 14): number {
  if (closes.length <= period) return 50.0;
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period;
    }
  }

  if (avgLoss === 0) return 100.0;
  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));
  return Number(rsi.toFixed(2));
}

export function calculateMACD(closes: number[], fast = 12, slow = 26, signal = 9): {
  macdLine: number;
  signalLine: number;
  histogram: number;
  crossover: 'BULLISH_CROSS' | 'BEARISH_CROSS' | 'ABOVE_SIGNAL' | 'BELOW_SIGNAL' | 'NEUTRAL';
} {
  if (closes.length < slow + signal) {
    return {
      macdLine: 0,
      signalLine: 0,
      histogram: 0,
      crossover: 'NEUTRAL',
    };
  }

  const fastEma = calculateEMASeries(closes, fast);
  const slowEma = calculateEMASeries(closes, slow);
  const macdSeries: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    macdSeries.push(fastEma[i] - slowEma[i]);
  }

  const signalSeries = calculateEMASeries(macdSeries.slice(slow - 1), signal);
  const currentMacd = macdSeries[macdSeries.length - 1];
  const prevMacd = macdSeries[macdSeries.length - 2] || currentMacd;
  const currentSignal = signalSeries[signalSeries.length - 1];
  const prevSignal = signalSeries[signalSeries.length - 2] || currentSignal;
  const currentHist = Number((currentMacd - currentSignal).toFixed(2));
  const prevHist = prevMacd - prevSignal;

  let crossover: 'BULLISH_CROSS' | 'BEARISH_CROSS' | 'ABOVE_SIGNAL' | 'BELOW_SIGNAL' | 'NEUTRAL' = 'NEUTRAL';
  if (prevHist <= 0 && currentHist > 0) {
    crossover = 'BULLISH_CROSS';
  } else if (prevHist >= 0 && currentHist < 0) {
    crossover = 'BEARISH_CROSS';
  } else if (currentHist > 0) {
    crossover = 'ABOVE_SIGNAL';
  } else if (currentHist < 0) {
    crossover = 'BELOW_SIGNAL';
  }

  return {
    macdLine: Number(currentMacd.toFixed(2)),
    signalLine: Number(currentSignal.toFixed(2)),
    histogram: currentHist,
    crossover,
  };
}

export function calculateATR(highs: number[], lows: number[], closes: number[], period = 14): number {
  if (highs.length < 2) return 1.0;
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);
  }
  if (trs.length < period) {
    const sum = trs.reduce((a, b) => a + b, 0);
    return Number((sum / (trs.length || 1)).toFixed(2));
  }
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return Number(atr.toFixed(2));
}

export function calculateBollingerBands(closes: number[], period = 20, multiplier = 2): {
  upper: number;
  middle: number;
  lower: number;
  bandwidthPct: number;
  percentB: number;
} {
  const middle = calculateSMA(closes, period);
  const slice = closes.slice(-period);
  const variance = slice.reduce((acc, val) => acc + Math.pow(val - middle, 2), 0) / (slice.length || 1);
  const stdev = Math.sqrt(variance);
  const upper = Number((middle + multiplier * stdev).toFixed(2));
  const lower = Number((middle - multiplier * stdev).toFixed(2));
  const currentPrice = closes[closes.length - 1];
  const bandwidthPct = middle > 0 ? Number((((upper - lower) / middle) * 100).toFixed(2)) : 0;
  const percentB = (upper - lower) > 0 ? Number(((currentPrice - lower) / (upper - lower)).toFixed(2)) : 0.5;

  return { upper, middle, lower, bandwidthPct, percentB };
}

export class TrendAnalysisService {
  /**
   * Run comprehensive trend analysis for an instrument across candle data
   */
  analyzeTrend(symbol: string, exchange = 'NSE', candles: any[], timeframe = '15m'): TrendAnalysisResult {
    const sym = symbol.toUpperCase().trim();
    const ex = exchange.toUpperCase();

    if (!candles || candles.length < 5) {
      return this.createDefaultResult(sym, ex, timeframe);
    }

    // Sort chronologically ascending
    const sorted = [...candles].sort((a, b) => new Date(a.candle_start || a.timestamp || a.date).getTime() - new Date(b.candle_start || b.timestamp || b.date).getTime());
    const closes = sorted.map(c => Number(c.close));
    const opens = sorted.map(c => Number(c.open || c.close));
    const highs = sorted.map(c => Number(c.high || c.close));
    const lows = sorted.map(c => Number(c.low || c.close));
    const volumes = sorted.map(c => Number(c.volume || 0));

    const currentPrice = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2] || currentPrice;
    const latestCandle = sorted[sorted.length - 1];
    const timestamp = latestCandle.candle_start || latestCandle.timestamp || latestCandle.date || new Date().toISOString();
    const sourceMode = latestCandle.source_mode || 'SIMULATED';

    // 1. Moving Averages
    const sma20 = calculateSMA(closes, Math.min(20, closes.length));
    const sma50 = calculateSMA(closes, Math.min(50, closes.length));
    const ema20 = calculateEMA(closes, Math.min(20, closes.length));
    const ema50 = calculateEMA(closes, Math.min(50, closes.length));
    const priceVsEma20Pct = ema20 > 0 ? Number((((currentPrice - ema20) / ema20) * 100).toFixed(2)) : 0;
    const priceVsEma50Pct = ema50 > 0 ? Number((((currentPrice - ema50) / ema50) * 100).toFixed(2)) : 0;

    let alignment: 'STRONG_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONG_BEARISH' = 'NEUTRAL';
    if (currentPrice > ema20 && ema20 > ema50 && priceVsEma20Pct > 0.5) {
      alignment = 'STRONG_BULLISH';
    } else if (currentPrice > ema20) {
      alignment = 'BULLISH';
    } else if (currentPrice < ema20 && ema20 < ema50 && priceVsEma20Pct < -0.5) {
      alignment = 'STRONG_BEARISH';
    } else if (currentPrice < ema20) {
      alignment = 'BEARISH';
    }

    // 2. Momentum & RSI
    const rsi = calculateRSI(closes, Math.min(14, closes.length - 1));
    const macd = calculateMACD(closes);

    const past5 = closes[Math.max(0, closes.length - 5)];
    const roc5 = past5 > 0 ? Number((((currentPrice - past5) / past5) * 100).toFixed(2)) : 0;
    const past14 = closes[Math.max(0, closes.length - 14)];
    const roc14 = past14 > 0 ? Number((((currentPrice - past14) / past14) * 100).toFixed(2)) : 0;

    let momentumDirection: 'EXPANDING_UP' | 'SLOWING_UP' | 'FLAT' | 'SLOWING_DOWN' | 'EXPANDING_DOWN' = 'FLAT';
    if (roc5 > 1.0 && macd.histogram > 0) momentumDirection = 'EXPANDING_UP';
    else if (roc5 > 0) momentumDirection = 'SLOWING_UP';
    else if (roc5 < -1.0 && macd.histogram < 0) momentumDirection = 'EXPANDING_DOWN';
    else if (roc5 < 0) momentumDirection = 'SLOWING_DOWN';

    // 3. Volume
    const currentVolume = volumes[volumes.length - 1] || 0;
    const avgVolume20 = calculateSMA(volumes, Math.min(20, volumes.length));
    const relativeVolume = avgVolume20 > 0 ? Number((currentVolume / avgVolume20).toFixed(2)) : 1.0;
    let volumeTrend: 'SURGING' | 'ABOVE_AVERAGE' | 'NORMAL' | 'LOW' = 'NORMAL';
    if (relativeVolume >= 2.0) volumeTrend = 'SURGING';
    else if (relativeVolume >= 1.25) volumeTrend = 'ABOVE_AVERAGE';
    else if (relativeVolume < 0.6) volumeTrend = 'LOW';

    // 4. Volatility
    const atr14 = calculateATR(highs, lows, closes, Math.min(14, highs.length - 1));
    const atrPct = currentPrice > 0 ? Number(((atr14 / currentPrice) * 100).toFixed(2)) : 0;
    const bollingerBands = calculateBollingerBands(closes, Math.min(20, closes.length));

    const indicators: IndicatorMetrics = {
      currentPrice,
      rsi,
      macd,
      movingAverages: {
        sma20,
        sma50,
        ema20,
        ema50,
        priceVsEma20Pct,
        priceVsEma50Pct,
        alignment,
      },
      volume: {
        currentVolume,
        avgVolume20,
        relativeVolume,
        volumeTrend,
      },
      volatility: {
        atr14,
        atrPct,
        bollingerBands,
      },
      momentum: {
        roc5,
        roc14,
        momentumDirection,
      },
    };

    // 5. Multi-Indicator Transparent Voting Matrix
    const evidence: Array<{ indicator: string; verdict: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; weight: number; detail: string }> = [];

    // Factor A: EMA Alignment & Price Stack (Weight: 25)
    if (alignment === 'STRONG_BULLISH') {
      evidence.push({ indicator: 'EMA Stack', verdict: 'BULLISH', weight: 25, detail: `Price (₹${currentPrice}) is above EMA20 (₹${ema20}) and EMA50 (₹${ema50}), with positive expansion.` });
    } else if (alignment === 'BULLISH') {
      evidence.push({ indicator: 'EMA Stack', verdict: 'BULLISH', weight: 15, detail: `Price is trading above 20 EMA (₹${ema20}), suggesting mild upward support.` });
    } else if (alignment === 'STRONG_BEARISH') {
      evidence.push({ indicator: 'EMA Stack', verdict: 'BEARISH', weight: 25, detail: `Price (₹${currentPrice}) is below EMA20 (₹${ema20}) and EMA50 (₹${ema50}), under selling pressure.` });
    } else if (alignment === 'BEARISH') {
      evidence.push({ indicator: 'EMA Stack', verdict: 'BEARISH', weight: 15, detail: `Price is trading below 20 EMA (₹${ema20}), indicating downward drift.` });
    } else {
      evidence.push({ indicator: 'EMA Stack', verdict: 'NEUTRAL', weight: 10, detail: `Price is compressing near moving average equilibrium.` });
    }

    // Factor B: RSI Momentum (Weight: 20)
    if (rsi >= 60 && rsi <= 80) {
      evidence.push({ indicator: 'RSI (14)', verdict: 'BULLISH', weight: 20, detail: `RSI is at ${rsi}, showing firm bullish momentum.` });
    } else if (rsi > 80) {
      evidence.push({ indicator: 'RSI (14)', verdict: 'BULLISH', weight: 15, detail: `RSI is at ${rsi}, indicating very strong upward momentum into overbought territory.` });
    } else if (rsi >= 52 && rsi < 60) {
      evidence.push({ indicator: 'RSI (14)', verdict: 'BULLISH', weight: 12, detail: `RSI is at ${rsi}, displaying mild positive momentum above centerline.` });
    } else if (rsi >= 40 && rsi < 48) {
      evidence.push({ indicator: 'RSI (14)', verdict: 'BEARISH', weight: 12, detail: `RSI is at ${rsi}, displaying mild negative drift below centerline.` });
    } else if (rsi >= 20 && rsi < 40) {
      evidence.push({ indicator: 'RSI (14)', verdict: 'BEARISH', weight: 20, detail: `RSI is at ${rsi}, reflecting active selling momentum.` });
    } else if (rsi < 20) {
      evidence.push({ indicator: 'RSI (14)', verdict: 'BEARISH', weight: 15, detail: `RSI is at ${rsi}, indicating deep oversold conditions under heavy selling.` });
    } else {
      evidence.push({ indicator: 'RSI (14)', verdict: 'NEUTRAL', weight: 10, detail: `RSI is balanced at ${rsi} around the neutral 50 centerline.` });
    }

    // Factor C: MACD Signal & Histogram (Weight: 20)
    if (macd.crossover === 'BULLISH_CROSS' || (macd.histogram > 0 && macd.macdLine > macd.signalLine)) {
      evidence.push({ indicator: 'MACD (12,26,9)', verdict: 'BULLISH', weight: 20, detail: `MACD line (${macd.macdLine}) is above signal (${macd.signalLine}), histogram positive (+${macd.histogram}).` });
    } else if (macd.crossover === 'BEARISH_CROSS' || (macd.histogram < 0 && macd.macdLine < macd.signalLine)) {
      evidence.push({ indicator: 'MACD (12,26,9)', verdict: 'BEARISH', weight: 20, detail: `MACD line (${macd.macdLine}) is below signal (${macd.signalLine}), histogram negative (${macd.histogram}).` });
    } else {
      evidence.push({ indicator: 'MACD (12,26,9)', verdict: 'NEUTRAL', weight: 10, detail: `MACD histogram (${macd.histogram}) shows low directional divergence.` });
    }

    // Factor D: Volume Confirmation (Weight: 15)
    if (relativeVolume >= 1.25) {
      const priceUp = currentPrice >= prevClose;
      evidence.push({
        indicator: 'Volume Confirmation',
        verdict: priceUp ? 'BULLISH' : 'BEARISH',
        weight: 15,
        detail: `Trading volume (${currentVolume.toLocaleString()}) is ${relativeVolume}x of the 20-candle average (${avgVolume20.toLocaleString()}), confirming price direction.`,
      });
    } else {
      evidence.push({
        indicator: 'Volume Confirmation',
        verdict: 'NEUTRAL',
        weight: 8,
        detail: `Relative volume is normal (${relativeVolume}x of baseline), signifying typical liquidity without major institutional volume bursts.`,
      });
    }

    // Factor E: Bollinger Band Position & Squeeze (Weight: 10)
    if (bollingerBands.percentB > 0.8) {
      evidence.push({ indicator: 'Bollinger Bands', verdict: 'BULLISH', weight: 10, detail: `Price is riding upper Bollinger band (Upper: ₹${bollingerBands.upper}, %B: ${bollingerBands.percentB}).` });
    } else if (bollingerBands.percentB < 0.2) {
      evidence.push({ indicator: 'Bollinger Bands', verdict: 'BEARISH', weight: 10, detail: `Price is pressing lower Bollinger band (Lower: ₹${bollingerBands.lower}, %B: ${bollingerBands.percentB}).` });
    } else {
      evidence.push({ indicator: 'Bollinger Bands', verdict: 'NEUTRAL', weight: 5, detail: `Price is centered within the volatility envelope (Middle: ₹${bollingerBands.middle}).` });
    }

    // Factor F: Short-Term Returns / ROC (Weight: 10)
    if (roc5 > 0.4) {
      evidence.push({ indicator: '5-Candle ROC', verdict: 'BULLISH', weight: 10, detail: `5-candle return is +${roc5}%, confirming positive recent trajectory.` });
    } else if (roc5 < -0.4) {
      evidence.push({ indicator: '5-Candle ROC', verdict: 'BEARISH', weight: 10, detail: `5-candle return is ${roc5}%, confirming negative short-term drift.` });
    } else {
      evidence.push({ indicator: '5-Candle ROC', verdict: 'NEUTRAL', weight: 5, detail: `5-candle return is flat (${roc5}%).` });
    }

    // Tally weighted votes
    let bullishWeight = 0;
    let bearishWeight = 0;
    let neutralWeight = 0;

    for (const ev of evidence) {
      if (ev.verdict === 'BULLISH') bullishWeight += ev.weight;
      else if (ev.verdict === 'BEARISH') bearishWeight += ev.weight;
      else neutralWeight += ev.weight;
    }

    const totalWeight = bullishWeight + bearishWeight + neutralWeight || 1;
    const bullishPct = (bullishWeight / totalWeight) * 100;
    const bearishPct = (bearishWeight / totalWeight) * 100;
    const neutralPct = (neutralWeight / totalWeight) * 100;

    let classification: TrendClassification = 'SIDEWAYS';
    let confidenceScore = 50;

    if (bullishPct >= 50 && bullishPct > bearishPct + 15) {
      classification = 'BULLISH';
      confidenceScore = Math.min(95, Math.round(bullishPct));
    } else if (bearishPct >= 50 && bearishPct > bullishPct + 15) {
      classification = 'BEARISH';
      confidenceScore = Math.min(95, Math.round(bearishPct));
    } else if (neutralPct >= 45 || Math.abs(bullishPct - bearishPct) <= 12) {
      classification = 'SIDEWAYS';
      confidenceScore = Math.min(85, Math.round(neutralPct));
    } else {
      classification = 'MIXED / UNCERTAIN';
      confidenceScore = 45;
    }

    const strengthLabel: 'STRONG' | 'MODERATE' | 'WEAK' | 'UNCERTAIN' =
      confidenceScore >= 75 ? 'STRONG' : confidenceScore >= 60 ? 'MODERATE' : confidenceScore >= 48 ? 'WEAK' : 'UNCERTAIN';

    // Summary texts
    const summary = `${classification} trend identified on the ${timeframe} timeframe with ${strengthLabel.toLowerCase()} confidence (${confidenceScore}% weighted indicator consensus).`;

    const beginnerExplanation = this.generateBeginnerExplanation(sym, classification, indicators, currentPrice);
    const advancedExplanation = this.generateAdvancedExplanation(sym, classification, indicators, evidence, confidenceScore);

    const result: TrendAnalysisResult = {
      id: `trend-${sym}-${timeframe}-${Date.now()}`,
      symbol: sym,
      exchange: ex,
      timeframe,
      timestamp,
      sourceMode,
      classification,
      confidenceScore,
      strengthLabel,
      summary,
      beginnerExplanation,
      advancedExplanation,
      indicators,
      evidence,
      historicalComparison: {
        previousClassification: 'SIDEWAYS',
        shiftDetected: false,
        trendDurationCandles: Math.min(12, closes.length),
      },
    };

    // Store in background
    db.insertTrendAnalysis({
      id: result.id,
      instrument_id: `inst-${ex.toLowerCase()}-${sym.toLowerCase()}`,
      symbol: sym,
      exchange: ex,
      timeframe,
      classification,
      confidence_score: confidenceScore,
      indicators,
      supporting_evidence: evidence,
      analyzed_at: timestamp,
    }).catch(() => {});

    return result;
  }

  private generateBeginnerExplanation(
    symbol: string,
    classification: TrendClassification,
    ind: IndicatorMetrics,
    currentPrice: number
  ): string {
    if (classification === 'BULLISH') {
      return `The stock ${symbol} is currently showing positive upward momentum. Its current price (₹${currentPrice.toFixed(2)}) is higher than its 20-period average price (₹${ind.movingAverages.ema20.toFixed(2)}). Buyers have been more active than sellers, and the momentum indicator (RSI at ${ind.rsi}) confirms steady buying interest. Please remember that market conditions change dynamically, and positive momentum does not guarantee future gains.`;
    }
    if (classification === 'BEARISH') {
      return `The stock ${symbol} is experiencing downward pressure. The price (₹${currentPrice.toFixed(2)}) is currently below its recent average (₹${ind.movingAverages.ema20.toFixed(2)}), which indicates that sellers have been more dominant in recent periods. Risk management is important here, as downward trends can persist until support levels are reached.`;
    }
    if (classification === 'SIDEWAYS') {
      return `The stock ${symbol} is currently moving sideways within a range. Neither buyers nor sellers have enough strength to push the price into a clear direction. Price is hovering close to its average price of ₹${ind.movingAverages.ema20.toFixed(2)}, and momentum indicators are neutral. In sideways markets, traders often wait for a breakout before taking action.`;
    }
    return `The technical indicators for ${symbol} are currently giving mixed or uncertain signals. Some indicators suggest upward movement while others show weakness. When market signals conflict, uncertainty is elevated, and caution is advised.`;
  }

  private generateAdvancedExplanation(
    symbol: string,
    classification: TrendClassification,
    ind: IndicatorMetrics,
    evidence: any[],
    confidenceScore: number
  ): string {
    const dominantFactors = evidence.filter(e => e.verdict === classification).map(e => e.indicator).join(', ');
    const emaState = ind.movingAverages.alignment.replace(/_/g, ' ');
    const rvol = ind.volume.relativeVolume;
    const atr = ind.volatility.atr14;

    return `Quantitative multi-factor synthesis classifies ${symbol} as ${classification} (confidence score: ${confidenceScore}/100). EMA stack is ${emaState} with price at ₹${ind.currentPrice.toFixed(2)} (vs 20 EMA: ₹${ind.movingAverages.ema20}, 50 EMA: ₹${ind.movingAverages.ema50}). Relative volume stands at ${rvol}x baseline with ATR(14) at ₹${atr} (${ind.volatility.atrPct}% of price). Primary supporting indicators include: ${dominantFactors || 'Balanced across indicator suite'}. Watch key Bollinger envelope boundaries at ₹${ind.volatility.bollingerBands.upper} and ₹${ind.volatility.bollingerBands.lower}.`;
  }

  private createDefaultResult(symbol: string, exchange: string, timeframe: string): TrendAnalysisResult {
    const timestamp = new Date().toISOString();
    return {
      id: `trend-${symbol}-${timeframe}-${Date.now()}`,
      symbol,
      exchange,
      timeframe,
      timestamp,
      sourceMode: 'SIMULATED',
      classification: 'SIDEWAYS',
      confidenceScore: 50,
      strengthLabel: 'UNCERTAIN',
      summary: 'Insufficient historical candles to compute reliable trend classification.',
      beginnerExplanation: 'Not enough price history is available yet to identify a confirmed trend for this stock.',
      advancedExplanation: 'Data sample size is below the statistical threshold (N < 5) required for technical indicator convergence.',
      indicators: {
        currentPrice: 1000,
        rsi: 50,
        macd: { macdLine: 0, signalLine: 0, histogram: 0, crossover: 'NEUTRAL' },
        movingAverages: { sma20: 1000, sma50: 1000, ema20: 1000, ema50: 1000, priceVsEma20Pct: 0, priceVsEma50Pct: 0, alignment: 'NEUTRAL' },
        volume: { currentVolume: 1000, avgVolume20: 1000, relativeVolume: 1.0, volumeTrend: 'NORMAL' },
        volatility: { atr14: 10, atrPct: 1.0, bollingerBands: { upper: 1020, middle: 1000, lower: 980, bandwidthPct: 4, percentB: 0.5 } },
        momentum: { roc5: 0, roc14: 0, momentumDirection: 'FLAT' },
      },
      evidence: [],
      historicalComparison: {
        previousClassification: 'SIDEWAYS',
        shiftDetected: false,
        trendDurationCandles: 0,
      },
    };
  }
}

export const trendAnalysisService = new TrendAnalysisService();
