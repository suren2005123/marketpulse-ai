# MarketPulse AI — Project Architecture & System Design
**Document Version:** 2.0.0 (Enterprise Release)  
**Target Markets:** National Stock Exchange of India (NSE) & Bombay Stock Exchange (BSE)

---

## 1. High-Level Architecture Overview

MarketPulse AI is an enterprise-grade financial analytics and rolling price forecasting platform designed to process, analyze, and forecast equities listed on the NSE and BSE. The architecture emphasizes **strict data segregation**, **zero data fabrication**, **financial integrity**, and **sub-2000ms latency SLA**.

```
                               ┌────────────────────────────────────────────────────────┐
                               │       Client Layer: React 18 + Vite + Tailwind        │
                               │           (Port 5173 - Dark-Themed FinTech UI)          │
                               └───────────────────────────┬────────────────────────────┘
                                                           │
                                      ┌────────────────────┴────────────────────┐
                                      │                                         │
                             HTTP REST Requests                          WebSocket Events
                           (CORS & Cookie Guard)                        (Socket.IO Engine)
                                      │                                         │
                                      ▼                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 Backend Gateway: Node.js Express 4 + TypeScript                        │
│                                           (Port 5000 / 0.0.0.0)                                        │
├───────────────────────────────────┬───────────────────────────────────┬────────────────────────────────┤
│ Authentication & Security         │ Core Market Processing Engine     │ AI & Advanced Analytics        │
│ • Bcrypt Password Hashing         │ • 9,668 Equities Catalogue Query  │ • Rolling Multi-Horizon Engine │
│ • Dual-Token JWT (Access/Refresh) │ • Multi-Mode Provider Router      │ • Anomaly Radar (Z-Scores)     │
│ • Secure HttpOnly Cookie Handling │ • OHLCV Candle Aggregator         │ • Explain My Stock Interpreter │
│ • IP/Email Rate Limiting (Lockout)│ • User Watchlists & Price Alerts  │ • Technical Trend Analyzer     │
│ • Production Demo Account Guard   │ • Strict Latency Budget Monitor   │ • Learning Companion Engine    │
└─────────────────┬─────────────────┴─────────────────┬─────────────────┴────────────────┬───────────────┘
                  │                                   │                                  │
                  ▼                                   ▼                                  ▼
      ┌───────────────────────┐           ┌───────────────────────┐          ┌───────────────────────┐
      │   PostgreSQL 18 DB    │           │ Market Data Adapters  │          │ Python ML Microservice│
      │ • 13 Relational Tables│           │ • Upstox V3 (Live WS) │          │ • PyTorch / scikit    │
      │ • Indexed Time-Series │           │ • TejHQ (Daily EOD)   │          │ • Leakage-Free Models │
      │ • Memory Cache Mirror │           │ • Simulated Feed      │          │ • Walk-Forward Evals  │
      └───────────────────────┘           └───────────────────────┘          └───────────────────────┘
```

---

## 2. Core Architectural Pillars

### A. Strict Data Segregation & Integrity
To prevent misleading financial information, market feeds are tagged with an explicit immutable `source_mode`:
- **`LIVE`**: Active, authenticated WebSocket tick stream from Upstox V3. Only permitted when authenticated broker connection is verified.
- **`END_OF_DAY`**: Official closing bhavcopy data delivered by TejHQ. Timestamps explicitly indicate the publishing trading session date in `Asia/Kolkata` time.
- **`SIMULATED`**: Deterministic Geometric Brownian Motion tick generator with realistic volatility clusters for development and offline evaluation.
- **`HISTORICAL_REPLAY`**: Authenticated playback of historical OHLCV candles at variable playback speeds (1x to 60x).

> [!IMPORTANT]
> The system strictly forbids presenting simulated prices as live data. If a live connection drops or fails authentication, the system transitions to an explicit disconnected or fallback state with clear visual UI notification.

### B. Scalable 9,668 Equity Catalogue
- **Scope**: Exclusively filtered to Indian equity shares (`EQ` series). Derivatives, futures, options, commodities, and debt instruments are excluded to maintain focused stock market analytics.
- **Search & Pagination**: Server-side pagination with SQL `LIMIT`/`OFFSET` boundaries, sub-millisecond in-memory Trie indexing, debounced multi-field searching (Symbol and Company Name), and multi-column sorting.
- **N/A Resilience**: Instruments with pending exchange quotes display `N/A` indicators rather than fabricated default values.

### C. Multi-Horizon AI Forecasting Engine
- **Horizon Definitions**:
  - **1 Minute**: High-frequency momentum and microstructure trend detection.
  - **5 Minutes**: Short-term tactical mean-reversion and order flow balance.
  - **15 Minutes**: Primary strategic forecast horizon balancing noise reduction with actionable insight.
- **Preventing Future-Data Leakage**: Features (Log Returns, EMA ratios, ATR, RSI, Volatility) are computed strictly on closed historical candle periods prior to prediction timestamp.
- **Empirical Prediction Intervals**: Upper and lower uncertainty bounds (80% and 90%) derived from empirical historical residual distributions.

---

## 3. Component Architecture

### Backend Module Organization
```
backend/src/
├── config/             # Environment validation, production security fail-safes
├── db/                 # PostgreSQL pool, schema migration, local sync mirror
├── modules/
│   ├── analysis/       # Trend classification, indicator calculations (RSI, MACD, BB)
│   ├── auth/           # Authentication router, TokenService, bcrypt, rate limiters
│   ├── education/      # Learning Companion topics, quiz evaluation, progress tracking
│   ├── explanation/    # Explain My Stock synthesis and beginner/advanced interpretations
│   ├── forecasts/      # Horizon dispatcher, feature engineer, evaluation metrics
│   ├── market/         # Catalogue query service, insights generator
│   ├── provider/       # Upstox V3, TejHQ, Simulated, and Replay data adapters
│   └── radar/          # Anomaly Radar scoring, volume spikes, backtest evaluator
├── routes/             # Express API route endpoints (/api/*)
└── index.ts            # Application bootstrap, Socket.IO gateway, middleware pipeline
```

### Frontend Module Organization
```
frontend/src/
├── api/                # Axios/Fetch API client, token interceptors, base URLs
├── components/         # Reusable UI widgets, Dark-theme charts, Navigation bars
│   ├── AnomalyRadar/   # Severity badges, anomaly radar tables, real-time cards
│   ├── ExplainMyStock/ # Beginner/Advanced explanation tabs, fact-vs-hypothesis cards
│   ├── Learning/       # Interactive modules, technical indicator guides, quizzes
│   └── Watchlist/      # Real-time price tracking, alert configuration
├── pages/              # Primary route views (Dashboard, Stocks, Details, Insights)
├── types/              # TypeScript interfaces for API contracts and domain models
└── App.tsx             # Root router, authentication context provider, Socket listener
```

---

## 4. Real-Time WebSocket Infrastructure
- **Technology**: Socket.IO with WebSocket transport priority.
- **Channel Partitioning**:
  - `tick:{instrumentId}`: Dedicated broadcast channel per subscribed equity.
  - `feed_status`: Global heartbeat publishing provider connection state, latency, and data mode.
  - `anomaly:broadcast`: Urgent event triggers for statistical outliers ($|Z| \ge 2.0$).
- **Subscription Lifecycle**: Automatic subscription cleanup on client disconnection to prevent memory leaks and redundant network overhead.
- **Upstox 100-Instrument Safeguard**: An LRU subscription priority queue automatically evicts the lowest-priority background subscriptions when capacity approaches the broker's 100-instrument limit.

---

## 5. Security & Defense-in-Depth
1. **Production Guard**: Demo account (`demo@marketpulse.ai`) is permanently disabled in production via backend security interceptor returning HTTP 401 (`DEMO_DISABLED`).
2. **Secret Enforcement**: Production startup terminates immediately if `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` are unset or set to development fallback values.
3. **Cookie Hygiene**: Refresh tokens are stored in `HttpOnly`, `SameSite=Strict`, `Secure` cookies.
4. **Rate Limiting**: IP and Email-based sliding-window rate limiters with 15-minute lockouts upon 5 consecutive failed authentication attempts.
