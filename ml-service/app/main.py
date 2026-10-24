"""
FastAPI Microservice for MarketPulse AI Rolling Price Forecasting.
Provides endpoints for training, inference, and walk-forward evaluation.
"""

from typing import Dict, List, Optional, Any
from contextlib import asynccontextmanager
import os
import pandas as pd
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.models.forecaster import MultiHorizonForecaster
from app.pipeline.synthetic_data import DEFAULT_INDIAN_STOCKS, generate_synthetic_candles

# Global in-memory forecasters cache
FORECASTERS: Dict[str, MultiHorizonForecaster] = {}


class CandleInput(BaseModel):
    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: float
    source_mode: Optional[str] = "SIMULATED"


class PredictRequest(BaseModel):
    symbol: str
    exchange: Optional[str] = "NSE"
    candles: List[CandleInput]
    source_mode: Optional[str] = "SIMULATED"


class TrainRequest(BaseModel):
    symbol: str
    exchange: Optional[str] = "NSE"
    candles: Optional[List[CandleInput]] = None
    synthetic_candles_count: Optional[int] = 600


class EvaluateRequest(BaseModel):
    forecast_id: str
    predicted_price: float
    actual_price: float
    anchor_price: float
    lower_bound: float
    upper_bound: float
    horizon_minutes: int


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-train baseline models for core Indian equities on startup
    print("Pre-training ML forecasting models for core Indian equities...")
    for sym in DEFAULT_INDIAN_STOCKS.keys():
        try:
            df = generate_synthetic_candles(sym, n_candles=450, seed=42)
            forecaster = MultiHorizonForecaster(sym)
            forecaster.train_all(df)
            FORECASTERS[sym] = forecaster
            print(f"Loaded trained models for {sym}")
        except Exception as e:
            print(f"Error initializing model for {sym}: {e}")
    yield
    print("Shutting down ML Service.")


app = FastAPI(
    title="MarketPulse AI — Rolling Price Forecasting Engine",
    version="2.0.0",
    description="Multi-Horizon (1m, 5m, 15m) ML Forecasting Engine for Indian Equities (NSE/BSE).",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "MarketPulse AI ML Engine",
        "version": "2.0.0",
        "loaded_models": list(FORECASTERS.keys()),
        "supported_horizons": [1, 5, 15]
    }


@app.post("/predict")
def predict_forecasts(req: PredictRequest):
    if len(req.candles) < 15:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"At least 15 historical 1-minute candles are required to generate features (provided: {len(req.candles)})."
        )

    # Convert to DataFrame
    df = pd.DataFrame([c.model_dump() for c in req.candles])
    df = df.sort_values(by="timestamp").reset_index(drop=True)

    symbol = req.symbol.upper()
    if symbol not in FORECASTERS:
        # Dynamically fit or load
        forecaster = MultiHorizonForecaster(symbol)
        forecaster.train_all(df)
        FORECASTERS[symbol] = forecaster
    else:
        forecaster = FORECASTERS[symbol]

    predictions = forecaster.predict_all(df)
    anchor_timestamp = df['timestamp'].iloc[-1]

    # Add metadata
    enriched_predictions = []
    for p in predictions:
        h = p["horizon_minutes"]
        # Target timestamp is h minutes after anchor
        try:
            anchor_dt = pd.to_datetime(anchor_timestamp)
            target_dt = anchor_dt + pd.Timedelta(minutes=h)
            target_str = target_dt.isoformat()
        except Exception:
            target_str = anchor_timestamp

        enriched_predictions.append({
            **p,
            "symbol": symbol,
            "exchange": req.exchange,
            "issued_at": anchor_timestamp,
            "target_time": target_str,
            "source_mode": req.source_mode
        })

    return {
        "symbol": symbol,
        "exchange": req.exchange,
        "issued_at": anchor_timestamp,
        "forecasts": enriched_predictions
    }


@app.post("/train")
def train_model(req: TrainRequest):
    symbol = req.symbol.upper()
    if req.candles and len(req.candles) >= 30:
        df = pd.DataFrame([c.model_dump() for c in req.candles])
    else:
        # Generate clean training dataset
        df = generate_synthetic_candles(symbol, n_candles=req.synthetic_candles_count or 600, seed=42)

    forecaster = MultiHorizonForecaster(symbol)
    metrics = forecaster.train_all(df)
    forecaster.save()
    FORECASTERS[symbol] = forecaster

    return {
        "status": "success",
        "symbol": symbol,
        "metrics": metrics
    }


@app.post("/evaluate")
def evaluate_forecast(req: EvaluateRequest):
    actual = req.actual_price
    pred = req.predicted_price
    anchor = req.anchor_price

    abs_error = abs(pred - actual)
    pct_error = (abs_error / actual) * 100.0

    actual_dir = 1 if actual >= anchor else -1
    pred_dir = 1 if pred >= anchor else -1
    directional_correct = bool(actual_dir == pred_dir)

    inside_interval = bool(req.lower_bound <= actual <= req.upper_bound)

    return {
        "forecast_id": req.forecast_id,
        "absolute_error": round(abs_error, 2),
        "percentage_error": round(pct_error, 3),
        "directional_correct": directional_correct,
        "inside_interval": inside_interval,
        "horizon_minutes": req.horizon_minutes
    }
