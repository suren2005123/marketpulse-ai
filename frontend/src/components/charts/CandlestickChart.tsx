import React, { useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Area,
  Line,
  ReferenceLine,
} from 'recharts';
import { Candle, Forecast } from '../../types/index.js';

interface ChartProps {
  symbol: string;
  candles: Candle[];
  forecasts?: Forecast[];
  sourceMode?: string;
}

export const CandlestickChart: React.FC<ChartProps> = ({
  symbol,
  candles,
  forecasts = [],
  sourceMode = 'SIMULATED',
}) => {
  const [selectedHorizon, setSelectedHorizon] = useState<number | 'all'>('all');

  // Format candles for display
  const chartData = candles.map((c) => {
    const isUp = c.close >= c.open;
    return {
      timestamp: c.timestamp,
      displayTime: new Date(c.timestamp).toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
      }),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      price: c.close,
      volume: c.volume,
      isUp,
      candleBodyBottom: Math.min(c.open, c.close),
      candleBodyHeight: Math.max(Math.abs(c.close - c.open), 0.5),
      type: 'HISTORICAL',
    };
  });

  // Attach future forecast points to chart timeline
  const lastCandle = chartData[chartData.length - 1];
  const anchorPrice = lastCandle ? lastCandle.close : 0;

  const forecastPoints = forecasts.map((f) => {
    return {
      timestamp: f.targetTime,
      displayTime: `+${f.horizonMinutes}m (${new Date(f.targetTime).toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
      })})`,
      predictedPrice: f.predictedPrice,
      lowerBound: f.lowerBound,
      upperBound: f.upperBound,
      horizon: f.horizonMinutes,
      type: 'FORECAST',
      anchorPrice,
    };
  });

  // Combine data with distinct separation
  const combinedSeries = [
    ...chartData.map((d) => ({
      ...d,
      historicalPrice: d.close,
      predictedPrice: null as number | null,
      lowerBound: null as number | null,
      upperBound: null as number | null,
    })),
    // Link bridge point from latest historical candle
    ...(lastCandle
      ? [
          {
            displayTime: 'Now',
            historicalPrice: lastCandle.close,
            predictedPrice: lastCandle.close,
            lowerBound: lastCandle.close,
            upperBound: lastCandle.close,
            volume: 0,
            type: 'BRIDGE',
          },
        ]
      : []),
    ...forecastPoints.map((fp) => ({
      displayTime: fp.displayTime,
      historicalPrice: null as number | null,
      predictedPrice: fp.predictedPrice,
      lowerBound: fp.lowerBound,
      upperBound: fp.upperBound,
      volume: 0,
      type: 'FORECAST',
    })),
  ];

  const minPrice = Math.min(
    ...candles.map((c) => c.low),
    ...forecasts.map((f) => f.lowerBound)
  );
  const maxPrice = Math.max(
    ...candles.map((c) => c.high),
    ...forecasts.map((f) => f.upperBound)
  );
  const padding = (maxPrice - minPrice) * 0.08 || 5;

  return (
    <div className="rounded-2xl glass-card p-5 border border-slate-800">
      {/* Header controls & legend */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-white font-mono">{symbol}</span>
          <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
            1-Min Interval
          </span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-950/60 text-blue-400 border border-blue-800/40">
            {sourceMode}
          </span>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
            <span className="text-slate-300">Observed History</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-cyan-400 border-dashed border-cyan-400"></span>
            <span className="text-cyan-400 font-medium">Predicted Price</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-cyan-500/20 border border-cyan-500/40"></span>
            <span className="text-cyan-300/80">Uncertainty Envelope (80%)</span>
          </div>
        </div>
      </div>

      {/* Main Candlestick & Forecast Area Chart */}
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={combinedSeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="forecastBand" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.03} />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="displayTime"
              stroke="#475569"
              tick={{ fill: '#94a3b8', fontSize: 10 }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[Math.floor(minPrice - padding), Math.ceil(maxPrice + padding)]}
              stroke="#475569"
              tick={{ fill: '#94a3b8', fontSize: 10 }}
              tickLine={false}
              orientation="right"
              tickFormatter={(v) => `₹${v.toFixed(1)}`}
            />

            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const data: any = payload[0].payload;
                  return (
                    <div className="p-3 rounded-xl bg-slate-900/95 border border-slate-700 shadow-xl text-xs space-y-1 font-mono">
                      <p className="text-slate-300 font-bold border-b border-slate-800 pb-1">
                        Time: {label}
                      </p>
                      {data.type === 'HISTORICAL' ? (
                        <>
                          <p className="text-slate-400">
                            Open: <span className="text-white">₹{data.open}</span>
                          </p>
                          <p className="text-slate-400">
                            High: <span className="text-emerald-400">₹{data.high}</span>
                          </p>
                          <p className="text-slate-400">
                            Low: <span className="text-rose-400">₹{data.low}</span>
                          </p>
                          <p className="text-slate-400">
                            Close: <span className="text-white font-bold">₹{data.close}</span>
                          </p>
                          <p className="text-slate-400">
                            Volume: <span className="text-slate-300">{data.volume}</span>
                          </p>
                        </>
                      ) : (
                        <>
                          <div className="text-cyan-400 font-bold pb-1">ML Rolling Forecast</div>
                          <p className="text-slate-400">
                            Forecast: <span className="text-cyan-300 font-bold">₹{data.predictedPrice}</span>
                          </p>
                          <p className="text-slate-400">
                            Interval: <span className="text-slate-300">₹{data.lowerBound} - ₹{data.upperBound}</span>
                          </p>
                        </>
                      )}
                    </div>
                  );
                }
                return null;
              }}
            />

            {/* Visual separation line where actual history ends and forecast begins */}
            <ReferenceLine
              x="Now"
              stroke="#06b6d4"
              strokeDasharray="4 4"
              label={{
                value: 'FORECAST HORIZONS →',
                fill: '#06b6d4',
                fontSize: 10,
                position: 'insideTopLeft',
              }}
            />

            {/* Historical price line */}
            <Line
              type="monotone"
              dataKey="historicalPrice"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />

            {/* Uncertainty Upper and Lower Band Area */}
            <Area
              type="monotone"
              dataKey="upperBound"
              stroke="#06b6d4"
              strokeWidth={1}
              strokeDasharray="3 3"
              fill="url(#forecastBand)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="lowerBound"
              stroke="#06b6d4"
              strokeWidth={1}
              strokeDasharray="3 3"
              fill="#07090e"
              isAnimationActive={false}
            />

            {/* Forecast predicted dotted path */}
            <Line
              type="monotone"
              dataKey="predictedPrice"
              stroke="#06b6d4"
              strokeWidth={2.5}
              strokeDasharray="4 4"
              dot={{ r: 4, fill: '#06b6d4' }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Volume Sub-Chart */}
      <div className="h-20 w-full mt-2 pt-2 border-t border-slate-800/60">
        <div className="text-[10px] uppercase font-mono text-slate-500 mb-1">
          Trading Volume (1m Aggregate)
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
            <Bar
              dataKey="volume"
              fill="#3b82f6"
              opacity={0.65}
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
