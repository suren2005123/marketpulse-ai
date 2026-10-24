"""
Feature Engineering Pipeline for MarketPulse AI.
Ensures zero data leakage: every feature at row t is strictly calculated
using only data available at or before timestamp t.
"""

from typing import Dict, List, Tuple
import numpy as np
import pandas as pd


def compute_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """Compute Relative Strength Index (RSI) using exponential moving average."""
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    
    avg_gain = gain.ewm(com=period - 1, min_periods=period).mean()
    avg_loss = loss.ewm(com=period - 1, min_periods=period).mean()
    
    rs = avg_gain / (avg_loss + 1e-10)
    rsi = 100 - (100 / (1 + rs))
    return rsi.fillna(50.0)


def extract_features(df: pd.DataFrame) -> Tuple[pd.DataFrame, List[str]]:
    """
    Extracts predictive technical and temporal features from 1-minute OHLCV candles.
    
    Expected columns:
        ['open', 'high', 'low', 'close', 'volume', 'timestamp']
    """
    df = df.copy()
    if 'timestamp' in df.columns:
        df['datetime'] = pd.to_datetime(df['timestamp'])
    elif not isinstance(df.index, pd.DatetimeIndex):
        df['datetime'] = pd.date_range(end=pd.Timestamp.now(), periods=len(df), freq='1min')
    else:
        df['datetime'] = df.index

    # Sort strictly chronologically
    df = df.sort_values(by='datetime').reset_index(drop=True)

    features = pd.DataFrame(index=df.index)

    # 1. Log returns over different backward windows
    close = df['close'].astype(float)
    features['log_ret_1'] = np.log(close / close.shift(1)).fillna(0.0)
    features['log_ret_3'] = np.log(close / close.shift(3)).fillna(0.0)
    features['log_ret_5'] = np.log(close / close.shift(5)).fillna(0.0)
    features['log_ret_15'] = np.log(close / close.shift(15)).fillna(0.0)

    # 2. Rolling Volatility
    features['vol_5'] = features['log_ret_1'].rolling(window=5, min_periods=2).std().fillna(0.0)
    features['vol_15'] = features['log_ret_1'].rolling(window=15, min_periods=3).std().fillna(0.0)

    # 3. Moving Average Ratios (Normalized price position relative to trend)
    sma_5 = close.rolling(window=5, min_periods=1).mean()
    sma_15 = close.rolling(window=15, min_periods=1).mean()
    features['ratio_sma_5'] = (close / sma_5) - 1.0
    features['ratio_sma_15'] = (close / sma_15) - 1.0

    # 4. Momentum / Oscillators
    features['rsi_14'] = compute_rsi(close, period=14) / 100.0  # Normalized to [0, 1]

    # 5. Price Range / Volatility metrics (High-Low spread relative to Close)
    high = df['high'].astype(float)
    low = df['low'].astype(float)
    features['hl_range_pct'] = ((high - low) / close).fillna(0.0)
    
    # 6. Volume Dynamics
    vol = df['volume'].astype(float) + 1.0
    vol_mean_15 = vol.rolling(window=15, min_periods=1).mean()
    features['rel_volume_15'] = (vol / vol_mean_15).fillna(1.0)
    features['vol_change_1'] = np.log(vol / vol.shift(1).fillna(vol)).fillna(0.0)

    # 7. Time of Day (IST Market Session: 09:15 to 15:30 -> 375 minutes)
    if 'datetime' in df.columns:
        minutes_since_midnight = df['datetime'].dt.hour * 60 + df['datetime'].dt.minute
        # Market open: 555 min (09:15), Market close: 930 min (15:30)
        market_progress = np.clip((minutes_since_midnight - 555) / 375.0, 0.0, 1.0)
        features['time_of_day_progress'] = market_progress
        # Cyclical sin/cos
        features['time_sin'] = np.sin(2 * np.pi * market_progress)
        features['time_cos'] = np.cos(2 * np.pi * market_progress)
    else:
        features['time_of_day_progress'] = 0.5
        features['time_sin'] = 0.0
        features['time_cos'] = 1.0

    feature_cols = list(features.columns)
    # Replace any potential inf or NaN
    features = features.replace([np.inf, -np.inf], 0.0).fillna(0.0)

    return features, feature_cols
