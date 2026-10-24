# MarketPulse AI (v2.0: Enterprise Production Edition)
### Real-Time Indian Stock Market Monitoring, Anomaly Radar & Rolling Price Forecasting Platform for NSE/BSE

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Equities Catalogue](https://img.shields.io/badge/Equities-9%2C668%20Active%20(NSE%20%2B%20BSE)-brightgreen.svg)]()
[![Latency SLA](https://img.shields.io/badge/Latency%20Budget-%3C2000ms%20p95-brightgreen.svg)]()
[![Data Modes](https://img.shields.io/badge/Data%20Modes-SIMULATED%20%7C%20END__OF__DAY%20%7C%20LIVE%20%7C%20REPLAY-cyan.svg)]()

MarketPulse AI is an enterprise-grade financial analytics and machine-learning price forecasting platform designed specifically for Indian equities listed on the **National Stock Exchange (NSE)** and **Bombay Stock Exchange (BSE)**.

> **Financial & Regulatory Disclaimer**: MarketPulse AI is an advanced quantitative analytics, anomaly surveillance, and educational forecasting platform — **not an automated trading or investment advisory system**. Machine learning models generate rolling statistical estimates and empirical prediction intervals based on completed historical candles. Past performance does not guarantee future results, and stock market investments are subject to market risks.

---

## 1. System Architecture

```
                               ┌─────────────────────────────────────────┐
                               │   MarketPulse AI React + Vite Frontend  │
                               │        (Port 5173 - Dark Theme UI)       │
                               └────────────────────┬────────────────────┘
                                                    │
                             ┌──────────────────────┴──────────────────────┐
                             │ HTTP REST API Proxy  │  WebSocket Socket.IO │
                             ▼                      ▼                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Node.js Express API & Real-Time Gateway              │
│                           (Port 5000 / 0.0.0.0)                        │
├────────────────────────────────┬───────────────────────────────────────┤
│ • Auth & Session (JWT + Cookie)│ • 9,668 Stock Catalogue Query Engine  │
│ • Anomaly Radar Engine (Z-Score│ • Market Move Investigator Service    │
│ • Provider Manager (Switchable)│ • Multi-Horizon Forecast Dispatcher   │
│ • Watchlist & Alert Isolation  │ • Candle Aggregator & Latency Budget  │
└────────────────┬───────────────┴───────────────────────┬───────────────┘
                 │                                       │
     ┌───────────┴───────────┐               ┌───────────┴───────────┐
     ▼                       ▼               ▼                       ▼
┌──────────────┐     ┌──────────────┐ ┌──────────────┐     ┌──────────────┐
│  PostgreSQL  │     │   In-Memory  │ │  Upstox V3   │     │  TejHQ EOD   │
│ Database 18  │     │ Cache & Sync │ │ Market Feed  │     │   Bhavcopy   │
│ (Port 5432)  │     │ (Local JSON) │ │  (Live WS)   │     │ (Daily EOD)  │
└──────────────┘     └──────────────┘ └──────────────┘     └──────────────┘
```

---

## 2. Key Capabilities & Features

### 1. Complete NSE & BSE Equity Catalogue (9,668 Equities)
- **Active Equities**: 4,615 NSE and 5,053 BSE equity instruments derived from official master files.
- **Strict Scope**: Pure equity shares (`EQ` series). Derivatives, commodities, expired contracts, and non-equity assets are filtered out.
- **Query Engine**: Sub-millisecond server-side pagination, multi-column sorting, debounced search by symbol or company name, and exchange filters (`ALL`, `NSE`, `BSE`).
- **N/A Safeguard**: Missing quotes display explicit `N/A` badges instead of fabricated prices or false zeroes.

### 2. Multi-Mode Market Data Architecture
Strict data segregation is enforced across all endpoints, charts, and badges:
- **`SIMULATED`**: Deterministic Geometric Brownian Motion tick generator with realistic volatility and volume clusters. Used for zero-dependency development and demonstration.
- **`END_OF_DAY` (TejHQ)**: Official end-of-day closing bhavcopy and historical OHLCV data from TejHQ. Displays explicit trading dates and Asia/Kolkata timestamps (`DD/MM/YYYY, HH:MM:SS IST`). Never mislabeled as live intraday.
- **`LIVE` (Upstox V3)**: Real-time WebSocket market streamer via official Upstox V3 SDK with OAuth2 access token exchange, token rotation, and auto-reconnection.
- **`HISTORICAL_REPLAY`**: Chronological playback of genuine historical candles at selectable speeds (1x, 5x, 10x, 60x).

### 3. Anomaly Radar & Market Move Investigator
- **Statistically Deterministic Radar**: Real-time detection of price return anomalies ($|Z| \ge 2.0$), volume spikes ($\ge 2.5\times$ 30-day baseline), and sector divergences ($> 3\%$).
- **Verified Fact vs. Hypothesis Separation**: The Investigator reports measured quantitative metrics (return $Z$, volume multiple, spread) alongside official exchange regulatory filings (NCLT orders, earnings reports, corporate actions).
- **Zero Fabrication**: If no corporate disclosure was filed on a particular date, the system explicitly reports: `"CAUSE_CANNOT_BE_ESTABLISHED: In strict compliance with financial integrity standards, cause cannot be definitively established from company fundamentals alone."`

### 4. Rolling Multi-Horizon ML Forecasting (1m, 5m, 15m)
- **Leakage-Free Feature Engineering**: Log returns, rolling volatility, RSI, ATR, and moving-average ratios derived solely from closed historical candles.
- **Empirical Prediction Intervals**: 80% and 90% confidence bands calculated from validation residual quantiles.
- **Continuous Walk-Forward Evaluation**: MAE, RMSE, Naive Baseline improvement %, directional accuracy, and interval coverage metrics.

---

## 3. Pre-Seeded Demo Account

Evaluators can sign in immediately using the **One-Click Demo Account Login** button on `/login` or by entering:
- **Email**: `demo@marketpulse.ai`
- **Password**: `DemoPassword123!`
- **Role**: `admin`
- **Initial Watchlist**: RELIANCE, TCS, INFY, HDFCBANK, TATAMOTORS
- **Initial Data Mode**: `SIMULATED` (safe, deterministic ticks with zero broker credentials needed)

---

## 4. Quick Start Guide (Windows 11 Setup)

### Prerequisites
- Node.js >= 20.x (`node -v`)
- PostgreSQL 16 or 18 running on port 5432 (`marketpulse` database)
- Python >= 3.10 (optional, for standalone ML service)

### Step 1: Clone and Configure Environment
```powershell
cd "F:\KD project"

# Copy environment template
Copy-Item .env.example .env
```

Ensure your `.env` contains your PostgreSQL credentials:
```ini
APP_MODE=SIMULATED
PORT=5000
FRONTEND_PORT=5173
DATABASE_URL=postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/marketpulse
JWT_ACCESS_SECRET=marketpulse_jwt_access_super_secret_key_2026_dev_env
JWT_REFRESH_SECRET=marketpulse_jwt_refresh_super_secret_key_2026_dev_env
```

### Step 2: Install Dependencies
```powershell
# From project root
npm install

# Or install per workspace:
cd "F:\KD project\backend"; npm install
cd "F:\KD project\frontend"; npm install
```

### Step 3: Run Non-Destructive Migrations & Seed
```powershell
cd "F:\KD project\backend"
npm run seed
```
This initializes the PostgreSQL schema (users, refresh tokens, instruments, market candles, forecasts, watchlists, alerts) and indexes without deleting existing data.

### Step 4: Start Services
Open two terminal windows:

**Terminal 1 — Backend Core (Port 5000)**:
```powershell
cd "F:\KD project\backend"
npm run dev
```

**Terminal 2 — Frontend Application (Port 5173)**:
```powershell
cd "F:\KD project\frontend"
npm run dev
```

Open your browser at **`http://localhost:5173`**.

---

## 5. Upstox V3 Live Market Integration

To connect live Upstox V3 feeds when approved by the broker:
1. Create an App on the [Upstox Developer Portal](https://upstox.com/developer/).
2. In the App Creation Form, enter the exact Redirect URL:
   ```
   http://localhost:5000/api/provider/upstox/callback
   ```
3. Copy your **API Key** (`UPSTOX_CLIENT_ID`) and **API Secret** (`UPSTOX_CLIENT_SECRET`) into `.env`:
   ```ini
   UPSTOX_CLIENT_ID=your_api_key_here
   UPSTOX_CLIENT_SECRET=your_api_secret_here
   UPSTOX_REDIRECT_URI=http://localhost:5000/api/provider/upstox/callback
   ```
4. In the MarketPulse AI UI under **Settings**, click **"Connect Upstox"** to authorize.
5. If your Upstox account reactivation is currently under review by the broker, MarketPulse AI automatically detects this state (`ACCOUNT_UNDER_REVIEW`) and seamlessly preserves TejHQ EOD data without infinite reconnect loops.

---

## 6. Automated Test Suites & Production Builds

### Run Frontend Tests
```powershell
cd "F:\KD project\frontend"
npm test
```
*Tests pass: 6/6 (session timeout guard, string type coercion, protected route fallback, All Stocks N/A safeguard, pagination boundaries, API client token injection).*

### Run Backend Tests
```powershell
cd "F:\KD project\backend"
npm test
```
*Tests pass: 51/51 across all 11 test suites (all stocks, anomaly radar, auth, authorization, catalogue, database, forecasting, market ingestion, realtime gateway, tejhq, upstox realtime).*

### Run Production Builds
```powershell
# Backend compilation
cd "F:\KD project\backend"
npm run build

# Frontend bundle
cd "F:\KD project\frontend"
npm run build
```

---

## 7. Windows Troubleshooting Guide

1. **Stuck on "Initializing MarketPulse Session…"**:
   - The frontend includes a 5-second `AbortController` timeout guard. If the backend is restarting or offline, an actionable **"Session Initialization Notice"** card appears with **"Retry Connection"** and **"Proceed to Sign In"** buttons.
2. **"Failed to fetch" on All Stocks**:
   - Resolved by binding the backend Express server to `0.0.0.0:5000` and optimizing catalogue candle enrichment from $O(N \times M)$ array filters down to a single-pass $O(N + M)$ Map lookup, dropping latency from 4.5s to 22ms.
3. **Port 5000 in Use**:
   - Check listening processes: `Get-NetTCPConnection -LocalPort 5000 -State Listen`
   - Kill conflicting PID: `Stop-Process -Id <PID> -Force`
4. **PostgreSQL Connection**:
   - Verify PostgreSQL is running: `Test-NetConnection -ComputerName localhost -Port 5432`
   - Test health endpoint: `curl http://127.0.0.1:5000/api/health`
