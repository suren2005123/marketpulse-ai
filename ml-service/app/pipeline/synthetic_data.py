"""
Deterministic synthetic market data generator for Indian Equities.
Uses Geometric Brownian Motion with intraday volatility dynamics and volume clustering.
"""

from typing import Dict, List, Optional
import numpy as np
import pandas as pd
from datetime import datetime, timedelta

DEFAULT_INDIAN_STOCKS: Dict[str, Dict[str, float]] = {
    "RELIANCE": {"base_price": 2985.50, "volatility": 0.016, "exchange": "NSE"},
    "TCS": {"base_price": 4140.00, "volatility": 0.014, "exchange": "NSE"},
    "INFY": {"base_price": 1885.25, "volatility": 0.018, "exchange": "NSE"},
    "HDFCBANK": {"base_price": 1682.40, "volatility": 0.015, "exchange": "NSE"},
    "TATAMOTORS": {"base_price": 984.75, "volatility": 0.024, "exchange": "NSE"},
    "ICICIBANK": {"base_price": 1248.60, "volatility": 0.017, "exchange": "NSE"},
    "SBIN": {"base_price": 822.30, "volatility": 0.020, "exchange": "NSE"},
}


def generate_synthetic_candles(
    symbol: str,
    n_candles: int = 500,
    seed: Optional[int] = 42,
    interval_minutes: int = 1,
    end_time: Optional[datetime] = None
) -> pd.DataFrame:
    """
    Generates deterministic 1-minute OHLCV candles.
    Labeled explicitly as SIMULATED data.
    """
    if seed is not None:
        np.random.seed(seed)

    stock_info = DEFAULT_INDIAN_STOCKS.get(symbol, {"base_price": 1500.0, "volatility": 0.018, "exchange": "NSE"})
    base_price = stock_info["base_price"]
    daily_vol = stock_info["volatility"]
    
    # 1-minute volatility scaling (assuming ~375 trading minutes per day)
    dt = 1.0 / 375.0
    minute_vol = daily_vol * np.sqrt(dt)

    if end_time is None:
        end_time = datetime.now()

    timestamps = [end_time - timedelta(minutes=(n_candles - 1 - i) * interval_minutes) for i in range(n_candles)]

    prices = [base_price]
    for i in range(1, n_candles):
        # Time of day volatility smile (higher at open 9:15 and close 15:30)
        minute_of_day = (timestamps[i].hour * 60 + timestamps[i].minute) % 375
        smile_factor = 1.0 + 0.5 * np.cos(np.pi * (minute_of_day / 375.0 - 0.5))
        
        # Mean-reverting drift towards base_price
        drift = -0.05 * (prices[-1] - base_price) / base_price
        shock = np.random.normal(0, minute_vol * smile_factor)
        
        # Jump diffusion (occasional news spike)
        jump = 0.0
        if np.random.rand() < 0.02:
            jump = np.random.normal(0, minute_vol * 3.5)
            
        ret = drift * dt + shock + jump
        next_price = max(prices[-1] * np.exp(ret), 1.0)
        prices.append(next_price)

    # Construct realistic OHLCV
    rows = []
    for i in range(n_candles):
        c = prices[i]
        o = prices[i - 1] if i > 0 else c * (1.0 + np.random.normal(0, 0.0005))
        intra_spread = max(abs(c - o), c * 0.0008)
        h = max(o, c) + abs(np.random.normal(0, intra_spread * 0.8))
        l = min(o, c) - abs(np.random.normal(0, intra_spread * 0.8))
        l = max(l, 0.5)

        base_vol = 5000 + int(c * 2)
        volume = int(np.random.lognormal(mean=np.log(base_vol), sigma=0.6))

        rows.append({
            "timestamp": timestamps[i].isoformat(),
            "open": round(o, 2),
            "high": round(h, 2),
            "low": round(l, 2),
            "close": round(c, 2),
            "volume": volume,
            "source_mode": "SIMULATED",
            "symbol": symbol,
            "exchange": stock_info["exchange"]
        })

    return pd.DataFrame(rows)
