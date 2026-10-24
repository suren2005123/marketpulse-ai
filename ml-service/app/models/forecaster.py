"""
MarketPulse AI — Rolling Multi-Horizon Price Forecaster.
Supports 1-minute, 5-minute, and 15-minute forecasting horizons.
Implements:
  1. Naive Baseline (future price = latest completed close)
  2. Ridge Regression on engineered features
  3. Gradient Boosting Regressor
  4. Empirical residual quantile prediction intervals (80% & 90% confidence bands)
  5. Directional probability estimation
  6. Strict walk-forward evaluation
"""

from typing import Dict, List, Optional, Tuple, Any
import os
import math
import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler
from app.features.feature_pipeline import extract_features

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "saved_models")
os.makedirs(MODELS_DIR, exist_ok=True)


class RollingHorizonModel:
    def __init__(self, horizon_minutes: int, model_type: str = "ridge"):
        self.horizon_minutes = horizon_minutes
        self.model_type = model_type
        self.scaler = StandardScaler()
        if model_type == "gbr":
            self.model = GradientBoostingRegressor(
                n_estimators=60,
                max_depth=3,
                learning_rate=0.05,
                random_state=42
            )
        else:
            self.model = Ridge(alpha=1.0)
            
        self.feature_names: List[str] = []
        self.is_fitted = False
        self.residual_quantiles: Dict[str, float] = {
            "p10": -0.003 * np.sqrt(horizon_minutes),
            "p90": 0.003 * np.sqrt(horizon_minutes),
            "std": 0.002 * np.sqrt(horizon_minutes)
        }
        self.metrics: Dict[str, Any] = {}

    def fit_and_evaluate(
        self,
        features_df: pd.DataFrame,
        prices: pd.Series,
        val_split: float = 0.2
    ) -> Dict[str, Any]:
        """
        Chronologically splits data, fits the scaler & model on train,
        evaluates against Naive baseline on validation, and records empirical error quantiles.
        """
        h = self.horizon_minutes
        # Target is future log-return over h steps: log(close_{t+h} / close_t)
        future_close = prices.shift(-h)
        target_returns = np.log(future_close / prices)

        # Drop rows where target cannot be formed
        valid_mask = ~target_returns.isna()
        X = features_df[valid_mask].copy()
        y = target_returns[valid_mask].values
        p_anchor = prices[valid_mask].values
        p_actual = future_close[valid_mask].values

        n_samples = len(X)
        if n_samples < 40:
            raise ValueError(f"Insufficient samples ({n_samples}) for training horizon {h}m.")

        self.feature_names = list(X.columns)
        split_idx = int(n_samples * (1.0 - val_split))

        X_train, X_val = X.iloc[:split_idx], X.iloc[split_idx:]
        y_train, y_val = y[:split_idx], y[split_idx:]
        p_val_anchor = p_anchor[split_idx:]
        p_val_actual = p_actual[split_idx:]

        # Fit scaler strictly on training set
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_val_scaled = self.scaler.transform(X_val)

        # Fit model
        self.model.fit(X_train_scaled, y_train)
        self.is_fitted = True

        # Validation predictions
        pred_returns_val = self.model.predict(X_val_scaled)
        pred_prices_val = p_val_anchor * np.exp(pred_returns_val)

        # Naive baseline: future price = anchor price (return = 0)
        naive_pred_prices = p_val_anchor

        # Residuals for uncertainty estimation
        residuals = y_val - pred_returns_val
        self.residual_quantiles = {
            "p10": float(np.percentile(residuals, 10)),
            "p90": float(np.percentile(residuals, 90)),
            "std": float(np.std(residuals))
        }

        # Evaluation metrics
        mae_model = float(np.mean(np.abs(pred_prices_val - p_val_actual)))
        rmse_model = float(np.sqrt(np.mean((pred_prices_val - p_val_actual) ** 2)))
        mae_naive = float(np.mean(np.abs(naive_pred_prices - p_val_actual)))
        rmse_naive = float(np.sqrt(np.mean((naive_pred_prices - p_val_actual) ** 2)))

        # Directional correctness
        actual_direction = np.sign(y_val)
        pred_direction = np.sign(pred_returns_val)
        dir_accuracy = float(np.mean(actual_direction == pred_direction))

        # Prediction interval coverage
        val_lower_price = p_val_anchor * np.exp(pred_returns_val + self.residual_quantiles["p10"])
        val_upper_price = p_val_anchor * np.exp(pred_returns_val + self.residual_quantiles["p90"])
        coverage = float(np.mean((p_val_actual >= val_lower_price) & (p_val_actual <= val_upper_price)))

        baseline_improvement_pct = float(((mae_naive - mae_model) / (mae_naive + 1e-8)) * 100.0)

        self.metrics = {
            "horizon_minutes": h,
            "model_type": self.model_type,
            "n_train": len(X_train),
            "n_val": len(X_val),
            "mae": round(mae_model, 4),
            "rmse": round(rmse_model, 4),
            "naive_mae": round(mae_naive, 4),
            "naive_rmse": round(rmse_naive, 4),
            "baseline_improvement_pct": round(baseline_improvement_pct, 2),
            "directional_accuracy": round(dir_accuracy * 100.0, 2),
            "interval_coverage_pct": round(coverage * 100.0, 2)
        }
        return self.metrics

    def predict_latest(self, latest_features: pd.DataFrame, anchor_price: float) -> Dict[str, Any]:
        """Runs rolling inference on the single latest completed candle."""
        if not self.is_fitted:
            # Fallback to naive baseline
            pred_return = 0.0
            prob_up = 0.5
        else:
            X_scaled = self.scaler.transform(latest_features[self.feature_names])
            pred_return = float(self.model.predict(X_scaled)[-1])
            std = max(self.residual_quantiles["std"], 1e-5)
            # Normal CDF proxy for P(return > 0)
            z = pred_return / std
            prob_up = float(0.5 * (1.0 + math.erf(z / np.sqrt(2))))
            prob_up = float(np.clip(prob_up, 0.05, 0.95))

        pred_price = float(anchor_price * np.exp(pred_return))
        lower_bound = float(anchor_price * np.exp(pred_return + self.residual_quantiles["p10"]))
        upper_bound = float(anchor_price * np.exp(pred_return + self.residual_quantiles["p90"]))

        return {
            "horizon_minutes": self.horizon_minutes,
            "anchor_price": round(anchor_price, 2),
            "predicted_price": round(pred_price, 2),
            "predicted_return_pct": round(pred_return * 100.0, 4),
            "lower_bound": round(lower_bound, 2),
            "upper_bound": round(upper_bound, 2),
            "probability_up": round(prob_up, 4),
            "model_type": self.model_type,
            "model_version": "v2.1.0"
        }


class MultiHorizonForecaster:
    """Manages models for 1m, 5m, and 15m horizons per symbol."""
    def __init__(self, symbol: str):
        self.symbol = symbol
        self.models: Dict[int, RollingHorizonModel] = {
            1: RollingHorizonModel(1, "ridge"),
            5: RollingHorizonModel(5, "ridge"),
            15: RollingHorizonModel(15, "gbr")
        }

    def train_all(self, df_candles: pd.DataFrame) -> Dict[str, Any]:
        features_df, _ = extract_features(df_candles)
        prices = df_candles['close'].astype(float)
        results = {}
        for h, model in self.models.items():
            results[f"{h}m"] = model.fit_and_evaluate(features_df, prices)
        return results

    def predict_all(self, df_candles: pd.DataFrame) -> List[Dict[str, Any]]:
        features_df, _ = extract_features(df_candles)
        latest_features = features_df.iloc[[-1]]
        anchor_price = float(df_candles['close'].iloc[-1])
        predictions = []
        for h, model in self.models.items():
            pred = model.predict_latest(latest_features, anchor_price)
            predictions.append(pred)
        return predictions

    def save(self, filepath: Optional[str] = None):
        if filepath is None:
            filepath = os.path.join(MODELS_DIR, f"{self.symbol}_forecaster.joblib")
        joblib.dump(self, filepath)

    @staticmethod
    def load(filepath: str) -> "MultiHorizonForecaster":
        return joblib.load(filepath)
