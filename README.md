# MarketPulse AI (v2: Real-Time + Authentication)
### Real-Time Indian Stock Market Monitoring & Rolling Price Forecasting Platform for NSE/BSE

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Latency SLA](https://img.shields.io/badge/Latency%20Budget-%3C2000ms%20p95-brightgreen.svg)]()
[![Data Modes](https://img.shields.io/badge/Data%20Modes-SIMULATED%20%7C%20REPLAY%20%7C%20LIVE-cyan.svg)]()

MarketPulse AI is an enterprise-grade, full-stack financial analytics and machine-learning price forecasting platform for Indian equities listed on the **National Stock Exchange (NSE)** and **Bombay Stock Exchange (BSE)**.

> **Financial Disclaimer**: MarketPulse AI is an educational forecasting and analytics platform, **not an automated trading or execution system**. Machine learning models generate rolling statistical estimates and empirical uncertainty ranges based on completed 1-minute historical candles. Future stock prices can never be predicted with certainty.

---

## 1. What Changed in v2 (Load-Bearing Architectural Additions)

1. **Multi-User Account Model & Security Isolation**:
   - Registered accounts with `bcrypt` (10 rounds) password hashing.
   - Access tokens (short-lived JWT, 15 min) stored **in memory** on client (never in `localStorage` to defend against XSS).
   - Rotating refresh tokens stored in `httpOnly`, `Secure`, `SameSite=Strict` cookies.
   - Strict server-side resource ownership: all `/api/watchlist` and `/api/alerts` queries filter by `req.user.userId`. Foreign access attempts are rejected with **403 Forbidden**.
   - Redis-backed login rate-limiting and lockout protection (5 failed attempts = 15 min lockout).
   - Pre-seeded **One-Click Demo Account** for instant evaluation without registration.

2. **Sub-2-Second Real-Time Pub/Sub Layer & SLA Verification**:
   - Redis pub/sub fan-out adapter (`@socket.io/redis-adapter`) enabling horizontal multi-instance clustering.
   - Authenticated WebSocket handshake: client sends JWT token; server extracts `userId` and joins a private room `user:<userId>`.
   - **Per-User Alert Isolation**: `alert:triggered` events are sent **exclusively** to the owning user's socket room.
   - **Global Market Broadcasts**: `market:update`, `candle:closed`, `forecast:update`, and `forecast:evaluated` broadcast to all authenticated connections.
   - **Explicit Latency Budget (< 2000ms)**: Every tick carries ingestion timestamps; the UI tracks and surfaces empirical **p50** and **p95** latency metrics in real time.
   - Exponential backoff reconnection (1s, 2s, 4s, 8s, max 10s) with visible UI status.
   - **REST State Resync**: Upon reconnection, the client automatically re-synchronizes quotes, forecasts, and alerts via REST rather than assuming all dropped packets were received.

3. **Multi-Horizon ML Forecasting Engine (1m, 5m, 15m)**:
   - Leakage-free feature engineering (log returns, rolling volatility, moving average ratios, RSI, ATR, and time-of-day progression).
   - Benchmarked against a **Naive Baseline** ($P_{t+h} = P_t$).
   - Ridge Regression for 1m and 5m; Gradient Boosting Regression for 15m.
   - Empirical prediction intervals (80% and 90% confidence bands) calculated from validation residual quantiles.
   - Directional probability estimation $P(r > 0)$.
   - Continuous walk-forward evaluation against subsequent observed prices.

---

## 2. Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Recharts, Lucide Icons |
| **Real-Time Client** | Socket.IO Client with auth handshake, exponential backoff & REST resync |
| **Backend API** | Node.js, Express.js, TypeScript, Zod, Helmet, Cookie-Parser, CORS |
| **Pub/Sub Fanout** | Redis 7 (`@socket.io/redis-adapter` + `ioredis`), In-Memory Mock fallback |
| **Database** | PostgreSQL 16 (Production) / High-Performance Embedded Store (Zero-setup local testing) |
| **ML Engine** | Python 3.14, FastAPI, scikit-learn, NumPy, Pandas, joblib |
| **DevOps** | Docker, Docker Compose, Windows 11 PowerShell runner scripts |

---

## 3. Pre-Seeded Evaluator Account

Evaluators can sign in immediately using the **One-Click Demo Account** button or these credentials:
- **Email**: `demo@marketpulse.ai`
- **Password**: `DemoPassword123!`
- **Role**: `admin`
- **Initial Watchlist**: RELIANCE, TCS, INFY, HDFCBANK, TATAMOTORS
- **Initial Mode**: `SIMULATED` (safe, deterministic ticks with zero broker credentials needed)

---

## 4. Quick Start Guide (Windows 11 Local Development)

### Prerequisites
- Node.js >= 20.x (`node -v`)
- Python >= 3.10 (`python --version`)

### Step 1: Install Dependencies
```powershell
# From project root
cd "f:\KD project"

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ..\frontend
npm install

# (Optional) Install ML service dependencies
cd ..\ml-service
pip install -r requirements.txt
```

### Step 2: Seed the Database
```powershell
cd "f:\KD project\backend"
npm run seed
```
This populates 10 Indian equities (RELIANCE, TCS, INFY, HDFCBANK, TATAMOTORS, ICICIBANK, SBIN, BHARTIARTL, ITC, LICI), sample historical 1-minute candles, pre-calculated walk-forward evaluations, and the demo user.

### Step 3: Start Services
Open two terminal windows:

**Terminal 1 (Backend API & Real-Time Gateway on port 5000)**:
```powershell
cd "f:\KD project\backend"
npm run dev
```

**Terminal 2 (Frontend Fintech App on port 5173)**:
```powershell
cd "f:\KD project\frontend"
npm run dev
```

Open your browser at: **`http://localhost:5173`**
Click **One-Click Demo Account Login** and experience the live platform!

---

## 5. Docker Compose Deployment (All 5 Services)

To run the complete production stack (PostgreSQL, Redis, Backend, ML Service, and Frontend) in Docker:

```bash
# Start all 5 containers
docker compose up -d

# Seed the database inside the backend container
docker compose exec backend npm run seed
```

Access points:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5000
- **Python ML Service**: http://localhost:8000/docs
- **Redis**: localhost:6379
- **PostgreSQL**: localhost:5432

---

## 6. Strict Data Source Separation

MarketPulse AI enforces complete segregation of three distinct market data modes:

```
┌─────────────────┬──────────────────────────────────────────────────────────────┐
│ Mode            │ Contract & Verification Rule                                 │
├─────────────────┼──────────────────────────────────────────────────────────────┤
│ SIMULATED       │ Synthetic Geometric Brownian Motion (GBM) tick generator     │
│                 │ with realistic intraday volatility and volume clusters. Labeled │
│                 │ explicitly as SIMULATED across charts, quotes, and badges.   │
├─────────────────┼──────────────────────────────────────────────────────────────┤
│ HISTORICAL      │ Genuine recorded historical candles replayed chronologically │
│ REPLAY          │ with variable playback speeds (1x, 5x, 10x, 60x). Preserves  │
│                 │ original candle intervals.                                   │
├─────────────────┼──────────────────────────────────────────────────────────────┤
│ LIVE            │ Streaming WebSocket connection to Upstox V3 API. Requires    │
│                 │ valid UPSTOX_ACCESS_TOKEN. Never substitutes synthetic ticks │
│                 │ upon disconnection; reports connection loss honestly.        │
└─────────────────┴──────────────────────────────────────────────────────────────┘
```

You can switch modes at any time using the **Mode Selector Badge** in the top navigation bar or under **Settings**.

---

## 7. Upstox V3 Integration Guide

To connect genuine live NSE/BSE market feeds:
1. Register on the [Upstox Developer Portal](https://upstox.com/developer/api-documentation/v3/).
2. Create an App to obtain `UPSTOX_CLIENT_ID` and `UPSTOX_CLIENT_SECRET`.
3. Generate a daily user authorization token using Upstox OAuth2 flow.
4. Add the token to `.env`:
   ```ini
   APP_MODE=LIVE
   UPSTOX_ACCESS_TOKEN=your_upstox_v3_bearer_token_here
   ```
5. Restart the backend or switch the mode to `LIVE` in the UI.

---

## 8. REST API Reference

### Authentication Endpoints
- `POST /api/auth/register` — Create a new account (`email`, `password`, `displayName`).
- `POST /api/auth/login` — Sign in; sets `httpOnly` refresh cookie, returns short-lived JWT access token.
- `POST /api/auth/refresh` — Rotates refresh token and returns new JWT access token.
- `POST /api/auth/logout` — Revokes stored refresh token and clears cookie.
- `GET  /api/auth/me` — *(Auth Required)* Returns current user profile.

### Market Data Endpoints
- `GET /api/instruments` — Lists active NSE/BSE equities.
- `GET /api/market/:exchange/:symbol/quote` — Latest price, OHLC, intraday change, and provider mode.
- `GET /api/market/:exchange/:symbol/candles?limit=100` — Historical 1-minute OHLCV candles.

### Rolling Forecasting Endpoints
- `GET /api/forecasts/:exchange/:symbol` — Latest 1m, 5m, and 15m forecasts with 80% uncertainty bounds.
- `GET /api/forecasts/:exchange/:symbol/history` — Evaluated historical predictions.
- `GET /api/forecasts/:exchange/:symbol/performance` — Walk-forward performance metrics (MAE, RMSE, Naive MAE, Directional Accuracy %, Interval Coverage %).

### User-Scoped Endpoints (403 on Cross-User Access)
- `GET    /api/alerts` — Current user's configured alerts.
- `POST   /api/alerts` — Create price/volume alert for current user.
- `PATCH  /api/alerts/:id` — Update or pause alert *(403 if not owner)*.
- `DELETE /api/alerts/:id` — Delete alert *(403 if not owner)*.
- `GET    /api/watchlist` — Current user's tracked equities.
- `POST   /api/watchlist` — Add stock to user's watchlist.
- `DELETE /api/watchlist/:instrumentId` — Remove stock from user's watchlist.

### System Diagnostics
- `GET  /api/health` — System uptime, database connectivity, and environment status.
- `GET  /api/system/feed-status` — Active provider, latency statistics (p50/p95), and staleness indicator.
- `POST /api/system/set-mode` — Switch mode between `SIMULATED`, `HISTORICAL_REPLAY`, and `LIVE`.

---

## 9. Real-Time Socket.IO Contract

Connect to `ws://localhost:5000` with the JWT access token in the auth handshake:
```javascript
const socket = io('http://localhost:5000', {
  auth: { token: accessToken },
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10000,
});
```

### Event Specification
| Event | Target | Payload |
|---|---|---|
| `market:update` | Broadcast | Live quote `{ symbol, price, open, high, low, close, volume, latencyMs }` |
| `candle:closed` | Broadcast | Finalized 1-minute candle `{ symbol, open, high, low, close, volume }` |
| `forecast:update` | Broadcast | Rolling multi-horizon forecasts `{ symbol, forecasts: [...] }` |
| `forecast:evaluated` | Broadcast | Forecast evaluation result `{ actual_price, absolute_error, directional_correctness }` |
| `provider:status` | Broadcast | Feed diagnostics `{ provider, connected, latencyMs: { p50, p95 } }` |
| `alert:triggered` | **Room `user:<id>`** | Alert notification `{ symbol, threshold, currentValue, message }` |

---

## 10. Automated Test Suite

Run the full automated test suite covering authentication, cross-user isolation, candle aggregation, latency budget, and ML evaluations:

```powershell
cd "f:\KD project\backend"
npm test
```

Expected test results:
```
# Subtest: Authentication: Password Hashing and Verification with bcrypt -> ok
# Subtest: Authentication: JWT Access Token and Expiration Validation -> ok
# Subtest: Authentication: Refresh Token Rotation and Reuse Detection -> ok
# Subtest: Authentication: Rate Limiting and Lockout on repeated failed attempts -> ok
# Subtest: Authorization: User Ownership and Strict Cross-User Access Isolation -> ok
# Subtest: Authorization: Watchlist Privacy Scoping -> ok
# Subtest: Forecasting: Horizons and Prediction Interval Consistency -> ok
# Subtest: Forecasting: Walk-Forward Evaluation against Observed Market Price -> ok
# Subtest: Market Ingestion: Tick Validation and 1-Minute Candle Aggregation -> ok
# Subtest: Market Ingestion: Latency Budget SLA Verification (< 2000ms) -> ok
# Subtest: Market Ingestion: Invalid Tick Rejection -> ok
# Subtest: Real-Time Gateway: Authenticated Sockets and Concurrent Delivery Latency -> ok
# tests 12 | pass 12 | fail 0
```

---

## 11. Security Audit Highlights

- **Passwords**: Never stored in plaintext. Hashed with bcrypt and unique salt.
- **Tokens**: Access tokens are kept in JavaScript memory and rehydrated via `/api/auth/refresh`. Never stored in `localStorage` or `sessionStorage`.
- **Cookies**: Refresh tokens are stored in `httpOnly`, `SameSite=Strict` cookies.
- **Resource Ownership**: Database queries for alerts and watchlists strictly enforce `user_id = req.user.userId`.
- **Brute Force Protection**: IP and account rate-limiting with 15-minute lockouts after 5 consecutive failed attempts.
- **Broker Secrets**: Upstox client credentials reside strictly on the backend server and are never exposed to browser bundles.
