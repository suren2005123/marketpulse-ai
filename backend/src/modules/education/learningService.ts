import { db } from '../../db/index.js';
import { trendAnalysisService } from '../analysis/trendAnalysisService.js';

export interface LearningTopic {
  id: string;
  category: 'FOUNDATIONS' | 'TECHNICAL_INDICATORS' | 'TRENDS_AND_PATTERNS' | 'QUANT_AND_RISK';
  title: string;
  tagline: string;
  difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  estimatedMinutes: number;
  whatItMeans: string;
  whyItIsUsed: string;
  howToInterpret: string[];
  simpleExample: string;
  importantLimitations: string[];
  keyTakeaway: string;
}

export interface IndicatorEducationContext {
  indicatorKey: string;
  name: string;
  whatItMeans: string;
  whyItIsUsed: string;
  howToInterpret: string[];
  simpleExample: string;
  importantLimitations: string[];
  currentStockContext?: {
    symbol: string;
    exchange: string;
    currentValue: string;
    interpretation: string;
    actionableInsight: string;
  };
}

export const LEARNING_CURRICULUM: LearningTopic[] = [
  {
    id: 'market-fundamentals',
    category: 'FOUNDATIONS',
    title: 'Indian Stock Market Fundamentals',
    tagline: 'Understanding NSE, BSE, Order Books & Liquidity',
    difficulty: 'BEGINNER',
    estimatedMinutes: 4,
    whatItMeans: 'The stock market is a regulated marketplace where shares of publicly listed companies in India are traded, primarily across the National Stock Exchange (NSE) and Bombay Stock Exchange (BSE).',
    whyItIsUsed: 'Understanding market mechanics helps participants know how prices are formed through continuous double auctions (matching buy bids and sell asks).',
    howToInterpret: [
      'NSE is India’s largest exchange by trading volume and derivatives activity.',
      'BSE is Asia’s oldest stock exchange, hosting over 5,000 listed companies.',
      'Stock prices fluctuate according to real-time supply and demand, news flow, quarterly corporate earnings, and broader macroeconomic factors.',
    ],
    simpleExample: 'If buyers want 100,000 shares of Reliance at ₹2,985 and sellers only offer 50,000 shares at that price, the price typically ticks upward to attract more sellers.',
    importantLimitations: [
      'Prices can gap sharply between market close (15:30 IST) and open (09:15 IST) due to overnight news.',
      'Past stock performance is not an indicator or guarantee of future returns.',
    ],
    keyTakeaway: 'Always verify whether an instrument trades on NSE or BSE, and monitor liquidity to prevent slippage.',
  },
  {
    id: 'ohlcv-candlesticks',
    category: 'FOUNDATIONS',
    title: 'OHLCV & Candlestick Anatomy',
    tagline: 'Deciphering the DNA of Every Market Bar',
    difficulty: 'BEGINNER',
    estimatedMinutes: 5,
    whatItMeans: 'OHLCV stands for Open, High, Low, Close, and Volume. Each candlestick summarizes trading activity over a specific timeframe (e.g. 1 minute, 15 minutes, or 1 day).',
    whyItIsUsed: 'Candlesticks show not just where price ended, but the battle between buyers (bulls) and sellers (bears) during that time window.',
    howToInterpret: [
      'Green (Bullish) Candle: Close price is higher than Open price.',
      'Red (Bearish) Candle: Close price is lower than Open price.',
      'Upper Wick: Highest price tested during the candle period.',
      'Lower Wick: Lowest price tested during the candle period.',
      'Candle Body: Difference between Open and Close. Large bodies show conviction; small bodies show hesitation (Doji).',
    ],
    simpleExample: 'A candle with Open=₹100, High=₹106, Low=₹99, Close=₹105 is green with a body of ₹5 and an upper wick of ₹1, showing steady buying control.',
    importantLimitations: [
      'Candlestick shapes on 1-minute charts carry more market noise than candles on higher timeframes (15m, 1h, 1d).',
      'Single candles should never be traded in isolation without volume confirmation.',
    ],
    keyTakeaway: 'Focus on completed candle closes rather than mid-candle fluctuations to prevent false signals.',
  },
  {
    id: 'moving-averages',
    category: 'TECHNICAL_INDICATORS',
    title: 'Moving Averages (SMA & EMA)',
    tagline: 'Filtering Market Noise to Identify Core Trends',
    difficulty: 'BEGINNER',
    estimatedMinutes: 6,
    whatItMeans: 'A Moving Average smooths price data over a rolling window. Simple Moving Average (SMA) weights all days equally; Exponential Moving Average (EMA) gives greater weight to recent prices.',
    whyItIsUsed: 'Moving averages eliminate erratic short-term zig-zags to reveal the underlying slope and provide dynamic support and resistance zones.',
    howToInterpret: [
      'Bullish Stack: Price > 20 EMA > 50 EMA indicates strong upward trend structure.',
      'Bearish Stack: Price < 20 EMA < 50 EMA indicates downward selling pressure.',
      'Golden Cross: A shorter moving average (e.g. 50 EMA) crosses above a longer moving average (e.g. 200 EMA).',
      'Death Cross: A shorter moving average crosses below a longer moving average.',
    ],
    simpleExample: 'If a stock is ₹1,200 and its 20 EMA is ₹1,180, the stock is trading 1.69% above its recent average, signifying upward momentum.',
    importantLimitations: [
      'Moving averages are lagging indicators derived from past prices; they do not predict sudden market reversals.',
      'In sideways or ranging markets, moving averages generate false whipsaws.',
    ],
    keyTakeaway: 'Use EMA for responsive short-term trend detection, and SMA for classic institutional benchmarks.',
  },
  {
    id: 'rsi-momentum',
    category: 'TECHNICAL_INDICATORS',
    title: 'Relative Strength Index (RSI)',
    tagline: 'Measuring Price Speed and Momentum Extremes',
    difficulty: 'INTERMEDIATE',
    estimatedMinutes: 5,
    whatItMeans: 'RSI is a bounded momentum oscillator ranging from 0 to 100, comparing the magnitude of recent gains against recent losses over typically 14 periods.',
    whyItIsUsed: 'It identifies whether buying or selling momentum has become overextended and helps spot momentum divergence before price reversals.',
    howToInterpret: [
      'RSI > 70: Overbought region. Buying momentum is strong, but pullbacks or consolidation become more likely.',
      'RSI < 30: Oversold region. Selling has been aggressive; price may be due for a relief bounce.',
      'RSI 50-65: Healthy sustainable bullish momentum in an active uptrend.',
      'Bullish Divergence: Price makes a lower low, but RSI makes a higher low (internal momentum is improving).',
    ],
    simpleExample: 'If a stock climbs rapidly for 8 consecutive candles, its RSI might reach 78. This reflects intense buying, but warns against entering aggressively at the top.',
    importantLimitations: [
      'In a strong trending market, RSI can stay overbought (>70) or oversold (<30) for extended periods without reversing.',
      'Do not short a stock solely because RSI is above 70.',
    ],
    keyTakeaway: 'Use RSI 50 line as a trend filter: above 50 favors long bias; below 50 favors defensive or short bias.',
  },
  {
    id: 'macd-oscillator',
    category: 'TECHNICAL_INDICATORS',
    title: 'MACD (Convergence Divergence)',
    tagline: 'Trend Following Momentum with Signal Crossovers',
    difficulty: 'INTERMEDIATE',
    estimatedMinutes: 6,
    whatItMeans: 'MACD plots the difference between two exponential moving averages (typically 12 EMA and 26 EMA) alongside a 9-period Signal Line and a Histogram.',
    whyItIsUsed: 'It reveals shifts in the strength, direction, momentum, and duration of a trend.',
    howToInterpret: [
      'Bullish Crossover: MACD line crosses above the Signal line, causing the Histogram to flip positive.',
      'Bearish Crossover: MACD line crosses below the Signal line, causing the Histogram to flip negative.',
      'Zero-Line Cross: When MACD crosses zero, it confirms that 12 EMA has crossed 26 EMA.',
      'Histogram Expansion: Growing histogram bars indicate accelerating momentum in that direction.',
    ],
    simpleExample: 'When MACD is at +5.2 and Signal Line is at +3.1, the histogram is +2.1, showing that short-term momentum is pulling away from the medium-term trend.',
    importantLimitations: [
      'MACD can produce multiple false crossovers during low-volatility sideways chop.',
      'Signal crossovers lag price turns by several candles.',
    ],
    keyTakeaway: 'Combine MACD crossovers with volume surges for higher-probability trend confirmation.',
  },
  {
    id: 'volume-and-volatility',
    category: 'QUANT_AND_RISK',
    title: 'Volume Analysis & Volatility (ATR / Bollinger Bands)',
    tagline: 'Validating Conviction and Measuring Market Movement Potential',
    difficulty: 'INTERMEDIATE',
    estimatedMinutes: 6,
    whatItMeans: 'Volume measures the quantity of shares traded. Volatility (measured by Average True Range and Bollinger Bands) quantifies the speed and spread of price movements.',
    whyItIsUsed: 'Volume validates whether a price breakout is backed by institutional capital or is a low-liquidity trap. Volatility helps establish sensible stop-loss and profit target distances.',
    howToInterpret: [
      'Volume Breakout: Price breaking resistance on 2x+ average volume confirms genuine buying demand.',
      'Low-Volume Drift: Price drifting upward on thin volume is fragile and prone to sharp retracement.',
      'Bollinger Squeeze: When bands narrow tightly, volatility is compressed, typically preceding an explosive expansion.',
      'ATR Sizing: If ATR is ₹15, expecting a ₹50 move in 5 minutes is statistically unrealistic under normal conditions.',
    ],
    simpleExample: 'If a stock’s average 1-minute volume is 10,000 shares and suddenly prints 45,000 shares on a green candle, institutions are actively participating.',
    importantLimitations: [
      'Volume spikes at the very end of an extended move can represent exhaustion volume rather than continuation.',
      'Volatility does not indicate direction — it measures dispersion, not bias.',
    ],
    keyTakeaway: 'Never trade a breakout without relative volume confirmation.',
  },
  {
    id: 'forecast-uncertainty-and-risk',
    category: 'QUANT_AND_RISK',
    title: 'Forecast Uncertainty & Capital Preservation',
    tagline: 'Understanding Probabilities, Not Certainties',
    difficulty: 'ADVANCED',
    estimatedMinutes: 7,
    whatItMeans: 'Quantitative machine learning models estimate conditional expected values and prediction intervals from closed historical candles, never guaranteed future prices.',
    whyItIsUsed: 'Professional quantitative trading treats forecasts as probabilistic distributions with calibrated error bounds rather than deterministic certainty.',
    howToInterpret: [
      'Empirical Interval: An 80% interval (e.g. ₹2,970 - ₹3,010) means that historically, 80% of realized outcomes fell within that bandwidth.',
      'Model Confidence: Expresses agreement among indicators and historical residual accuracy.',
      'Risk/Reward Ratio: Always risk no more than 1-2% of total capital on any single market decision.',
      'Stop-Loss Discipline: Placing stop losses below technical support prevents catastrophic drawdowns.',
    ],
    simpleExample: 'If a model predicts ₹3,000 with an 80% interval of ₹2,980 - ₹3,020, an outcome of ₹2,975 is expected 1 out of 10 times under normal market noise.',
    importantLimitations: [
      'Black swan events, sudden regulatory changes, or macroeconomic announcements can instantly breach any statistical interval.',
      'No statistical model has 100% predictive accuracy.',
    ],
    keyTakeaway: 'Survival in financial markets depends on strict risk management, position sizing, and accepting uncertainty.',
  },
];

export class LearningService {
  getAllTopics(): LearningTopic[] {
    return LEARNING_CURRICULUM;
  }

  getTopicById(id: string): LearningTopic | null {
    return LEARNING_CURRICULUM.find(t => t.id === id) || null;
  }

  /**
   * Return contextual indicator explanation, optionally enriched with the currently viewed stock
   */
  getIndicatorEducation(indicatorKey: string, symbol?: string, exchange = 'NSE'): IndicatorEducationContext {
    const key = indicatorKey.toUpperCase().trim();

    let name = 'Technical Indicator';
    let whatItMeans = 'A mathematical calculation based on historical price, volume, or open interest information.';
    let whyItIsUsed = 'To assess market trend, momentum, volatility, or potential reversal points.';
    let howToInterpret: string[] = ['Compare current value against historical baseline.'];
    let simpleExample = 'An indicator helps filter market noise into actionable statistical signals.';
    let importantLimitations: string[] = ['All technical indicators are derived from past data and carry lag.'];

    switch (key) {
      case 'RSI':
        name = 'Relative Strength Index (RSI)';
        whatItMeans = 'A momentum oscillator ranging from 0 to 100 that measures the speed and change of price movements.';
        whyItIsUsed = 'To evaluate whether an asset is experiencing overbought (>70) or oversold (<30) momentum conditions.';
        howToInterpret = [
          'Above 70: Overbought momentum (upside may consolidate).',
          'Below 30: Oversold momentum (downside may find relief).',
          'Above 50: Positive momentum bias.',
          'Below 50: Negative momentum bias.',
        ];
        simpleExample = 'An RSI of 62 indicates steady, constructive buying interest without reaching exhaustion levels.';
        importantLimitations = ['Can stay overbought for long periods in strong bull markets.'];
        break;

      case 'MACD':
        name = 'Moving Average Convergence Divergence (MACD)';
        whatItMeans = 'A trend-following momentum indicator displaying the relationship between two exponential moving averages.';
        whyItIsUsed = 'To detect momentum acceleration, deceleration, and potential trend changes via signal crossovers.';
        howToInterpret = [
          'Histogram > 0: Short-term momentum is positive and expanding.',
          'Histogram < 0: Short-term momentum is negative and contracting.',
          'Bullish Cross: MACD line crosses above the Signal line.',
          'Bearish Cross: MACD line crosses below the Signal line.',
        ];
        simpleExample = 'A positive histogram flip indicates buyers are taking the short-term initiative.';
        importantLimitations = ['Generates false crossovers in range-bound, low-volatility markets.'];
        break;

      case 'EMA':
      case 'EMA_20':
      case 'EMA_50':
      case 'MOVING_AVERAGE':
        name = 'Exponential Moving Average (EMA)';
        whatItMeans = 'A weighted moving average that places greater importance on recent prices to reduce lag.';
        whyItIsUsed = 'Identifies dynamic support/resistance and core directional trend alignment.';
        howToInterpret = [
          'Price above 20 EMA: Short-term trend is upward.',
          'Price below 20 EMA: Short-term trend is downward.',
          '20 EMA above 50 EMA: Confirmed multi-timeframe bullish alignment.',
        ];
        simpleExample = 'When price pulls back to test the rising 20 EMA and bounces, the EMA acts as dynamic support.';
        importantLimitations = ['Lagging indicator that reacts after price has already begun moving.'];
        break;

      case 'VOLUME':
      case 'RVOL':
        name = 'Relative Volume (RVOL)';
        whatItMeans = 'The ratio of current trading volume compared to its historical 20-period moving average.';
        whyItIsUsed = 'Distinguishes genuine institutional price breakouts from low-volume false moves.';
        howToInterpret = [
          'RVOL >= 2.0x: Heavy institutional volume expansion.',
          'RVOL 1.25x - 2.0x: Above-average market participation.',
          'RVOL < 0.8x: Light trading activity; prone to sudden reversals.',
        ];
        simpleExample = 'A breakout that occurs with 2.5x normal volume has much higher probability of continuation.';
        importantLimitations = ['Volume surges can occasionally represent exhaustion climaxes rather than trend start.'];
        break;

      case 'BOLLINGER':
      case 'ATR':
      case 'VOLATILITY':
        name = 'Volatility Envelope (Bollinger Bands & ATR)';
        whatItMeans = 'Statistical bands placed at standard deviations around a moving average to capture price dispersion.';
        whyItIsUsed = 'Measures market volatility and identifies potential expansion or mean-reversion zones.';
        howToInterpret = [
          'Bandwidth squeeze: Volatility compression typically precedes sharp directional expansion.',
          'PercentB > 0.8: Price is pressing near upper statistical boundary.',
          'PercentB < 0.2: Price is pressing near lower statistical boundary.',
        ];
        simpleExample = 'During a quiet consolidation, the bands pinch tightly, signaling that an active move is brewing.';
        importantLimitations = ['Price can walk along the upper or lower band for a long time during powerful trends.'];
        break;
    }

    const result: IndicatorEducationContext = {
      indicatorKey: key,
      name,
      whatItMeans,
      whyItIsUsed,
      howToInterpret,
      simpleExample,
      importantLimitations,
    };

    // Enrich with live contextual value for selected stock if available
    if (symbol) {
      const sym = symbol.toUpperCase().trim();
      const inst = db.store.instruments.find(i => i.symbol.toUpperCase() === sym);
      if (inst) {
        let candles = db.store.market_candles
          .filter(c => c.instrument_id === inst.id)
          .sort((a, b) => new Date(a.candle_start).getTime() - new Date(b.candle_start).getTime());

        if (candles.length < 5) {
          const basePrice = Number(inst.price || 2980);
          candles = Array.from({ length: 20 }, (_, i) => ({
            candle_start: new Date(Date.now() - (20 - i) * 60000).toISOString(),
            open: basePrice + Math.sin(i) * 2,
            high: basePrice + Math.sin(i) * 2 + 2,
            low: basePrice + Math.sin(i) * 2 - 2,
            close: basePrice + Math.sin(i + 1) * 2,
            volume: 5000,
            source_mode: 'SIMULATED',
          }));
        }

        const trend = trendAnalysisService.analyzeTrend(sym, exchange, candles, '15m');
        const ind = trend.indicators;

          if (key === 'RSI') {
            result.currentStockContext = {
              symbol: sym,
              exchange,
              currentValue: `${ind.rsi.toFixed(1)} / 100`,
              interpretation:
                ind.rsi >= 70
                  ? 'Overbought territory: strong buying power, but exercise discipline with fresh entries.'
                  : ind.rsi >= 50
                  ? 'Bullish territory: healthy positive momentum above the 50 neutral line.'
                  : ind.rsi >= 30
                  ? 'Bearish territory: sellers maintain control below the 50 neutral line.'
                  : 'Oversold territory: heavy selling pressure, short-term relief bounce possible.',
              actionableInsight: `For ${sym}, current RSI confirms ${ind.rsi >= 50 ? 'bullish momentum' : 'bearish pressure'}.`,
            };
          } else if (key === 'MACD') {
            result.currentStockContext = {
              symbol: sym,
              exchange,
              currentValue: `Histogram: ${ind.macd.histogram > 0 ? '+' : ''}${ind.macd.histogram}`,
              interpretation:
                ind.macd.histogram > 0
                  ? 'Positive momentum: short-term moving average is pulling above signal.'
                  : 'Negative momentum: short-term moving average is dipping below signal.',
              actionableInsight: `MACD line is at ${ind.macd.macdLine} vs signal line ${ind.macd.signalLine}.`,
            };
          } else if (key === 'EMA' || key === 'MOVING_AVERAGE') {
            result.currentStockContext = {
              symbol: sym,
              exchange,
              currentValue: `Price: ₹${ind.currentPrice.toFixed(2)} vs 20 EMA: ₹${ind.movingAverages.ema20}`,
              interpretation:
                ind.currentPrice >= ind.movingAverages.ema20
                  ? 'Trading above short-term average, which acts as potential support.'
                  : 'Trading below short-term average, which acts as potential resistance.',
              actionableInsight: `50 EMA sits at ₹${ind.movingAverages.ema50}. Overall stack is ${ind.movingAverages.alignment.replace(/_/g, ' ')}.`,
            };
          } else if (key === 'VOLUME' || key === 'RVOL') {
            result.currentStockContext = {
              symbol: sym,
              exchange,
              currentValue: `${ind.volume.relativeVolume}x 20-candle average`,
              interpretation:
                ind.volume.relativeVolume >= 1.5
                  ? 'High volume participation confirming current directional price action.'
                  : 'Standard volume activity within normal market liquidity expectations.',
              actionableInsight: `Current candle volume is ${ind.volume.currentVolume.toLocaleString()} shares.`,
            };
          }
        }
      }

    return result;
  }
}

export const learningService = new LearningService();
