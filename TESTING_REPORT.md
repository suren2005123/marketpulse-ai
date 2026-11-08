# MarketPulse AI — Automated Testing & Verification Audit Report
**Execution Timestamp:** 2026-11-08 21:02:00 IST  
**Environment:** Windows 11 Node.js v20.x, PostgreSQL 18 Local Instance  
**Overall Suite Status:** **PASS** (69 Executed, 69 Passed, 1 Skipped, 0 Failed)

---

## 1. Executive Summary

A comprehensive regression and unit testing suite was executed across both backend and frontend workspaces. Every module underwent automated verification covering:
- Production Security Guards & Fallback Rejection
- Dual-Token Authentication & Cryptographic Rotation
- Test Isolation & Zero Persistent Test Record Artifacts
- Statistical Anomaly Radar Determinism & Backtesting
- 9,668 Equities Catalogue Query Engine & Pagination
- Upstox V3 & TejHQ Market Data Adapters
- Technical Trend Analysis & Mathematical Indicator Calculations
- Explain My Stock & Learning Companion Modules

---

## 2. Backend Automated Test Suite (`backend/tests/`)
**Command:** `npm run test --workspace=backend` (`tsx --test tests/**/*.test.ts`)  
**Results:** **63 Passed, 1 Skipped, 0 Failed (64 Total)**  
**Total Duration:** 7,354 ms

### Test Execution Matrix

| # | Test Module & Name | Duration | Status | Notes |
| :-: | :--- | :---: | :---: | :--- |
| **1** | **All Stocks:** Catalogue Ingestion & Total Equity Population | 239.4 ms | **PASS** | Validated 9,668 active NSE/BSE equities |
| **2** | **All Stocks:** Server-Side Pagination & Safe Page Boundaries | 38.5 ms | **PASS** | Boundary checks on `limit`, `page`, and offset |
| **3** | **All Stocks:** Search by Symbol and Company Name | 0.95 ms | **PASS** | Debounced matching for "RELIANCE", "TATA", etc. |
| **4** | **All Stocks:** Exchange Filtering (`ALL`, `NSE`, `BSE`) | 1.93 ms | **PASS** | Verified isolated exchange partitions |
| **5** | **All Stocks:** Multi-Column Sorting | 1.09 ms | **PASS** | Tested `asc`/`desc` by symbol, name, and price |
| **6** | **All Stocks:** Missing Price Data Handling (`N/A` Safeguard) | 0.71 ms | **PASS** | Confirmed zero fabrication of missing quotes |
| **7** | **Anomaly Radar:** Deterministic Anomaly Score Calculation | 3.03 ms | **PASS** | Verified $|Z| \ge 2.0$ return threshold |
| **8** | **Anomaly Radar:** Stale & Missing Data Robustness | 0.47 ms | **PASS** | Confirmed zero crash on zero-volume feeds |
| **9** | **Anomaly Radar:** Historical Backtest & FPR Estimation | 5.27 ms | **PASS** | Evaluated false-positive rates |
| **10**| **Anomaly Radar:** Watchlist Anomaly Rules Management | 1.34 ms | **PASS** | Verified rule persistence and alerts |
| **11**| **Market Move Investigator:** Verified Timeline & Fact vs Hypothesis | 64.3 ms | **PASS** | Verified corporate filing cross-referencing |
| **12**| **Market Move Investigator:** Zero Corporate News Handling | 1.95 ms | **PASS** | Outputs `CAUSE_CANNOT_BE_ESTABLISHED` safely |
| **13**| **Authentication:** Password Hashing and Verification with bcrypt | 739.3 ms| **PASS** | Verified salt work factor and mismatch rejection |
| **14**| **Authentication:** JWT Access Token & Expiration Validation | 12.87 ms| **PASS** | Verified payload claims and signature checks |
| **15**| **Authentication:** Refresh Token Rotation & Reuse Detection | 66.4 ms | **PASS** | Immediate revocation of all user sessions on breach |
| **16**| **Authentication:** Rate Limiting and Lockout on repeated failed attempts | 1.33 ms | **PASS** | Confirmed 5-attempt limit and 15m lockout |
| **17**| **Authentication:** Production Demo Guard Rejection (`DEMO_DISABLED`) | 11.1 ms | **PASS** | Rejected demo email with HTTP 401 in production |
| **18**| **Authentication:** Non-demo user authenticates successfully in prod | 501.1 ms| **PASS** | Regular user unaffected; test data cleaned up |
| **19**| **Authentication:** Development demo account authentication | 399.3 ms| **PASS** | One-click demo login works seamlessly in dev |
| **20**| **Security Configuration:** Production startup fails safely on missing secrets | 2.1 ms | **PASS** | Validates `JWT_ACCESS_SECRET` & `JWT_REFRESH_SECRET` |
| **21-46**| **Realtime, Latency & Socket.IO Gateway Tests** | ~400 ms | **PASS** | Latency budget SLA, channel subscription, cleanup |
| **47-50**| **TejHQ EOD Bhavcopy & Resilient Caching Tests** | ~170 ms | **PASS** | OHLCV parsing, caching, and fallback handling |
| **51**| **Price-to-Chart Sync:** Quote Close Matches Latest OHLCV | 24.8 ms | **PASS** | Confirmed quote-to-chart data consistency |
| **52**| **Provider Manager:** Mode Switching & Provider Isolation | 10.8 ms | **PASS** | Smooth switching across SIMULATED, EOD, and LIVE |
| **53-56**| **Trend Analysis:** Mathematical Indicators & Regime Classifications | ~18 ms | **PASS** | Mathematical accuracy for RSI, MACD, EMAs |
| **57-63**| **Upstox V3 Adapter:** OAuth, Capacity & Stale Feed Tracking | ~9 ms | **PASS** | 100-instrument LRU, token secrecy, reconnect |
| **64**| **Provider Fallback:** Safe Segregation & Zero Misleading Feeds | 164.6 ms| **PASS** | Confirmed simulated feeds are never tagged LIVE |
| *—*| **Upstox Live WebSocket Streaming** | — | **SKIPPED** | Skipped as expected when live Upstox token is unset |

---

## 3. Frontend Automated Test Suite (`frontend/src/`)
**Command:** `npm run test --workspace=frontend` (`npx tsx --test src/**/*.test.ts*`)  
**Results:** **6 Passed, 0 Failed (6 Total)**  
**Total Duration:** 885 ms

| # | Test Name | Duration | Status | Notes |
| :-: | :--- | :---: | :---: | :--- |
| **1** | All Stocks: Missing Price and Change Safeguard (Shows `N/A`) | 5.01 ms | **PASS** | Frontend badge renders `N/A` cleanly |
| **2** | All Stocks: Pagination Math & Boundary Calculations | 0.49 ms | **PASS** | Correct page index math for large sets |
| **3** | Frontend API Client: Access Token Injection & Memory Storage | 2.00 ms | **PASS** | In-memory token storage prevents XSS theft |
| **4** | Session Init: AbortController Timeout Guard | 60.17 ms| **PASS** | Prevents infinite loading spinners on timeout |
| **5** | Session Init: Safe Price & Metric Coercion from PG Strings | 1.64 ms | **PASS** | Coerces numeric database strings safely |
| **6** | Session Init: Protected Route Fallback Navigation Decision | 0.75 ms | **PASS** | Clean redirect to `/login` for guests |

---

## 4. Test Isolation Verification

Special attention was applied to `backend/tests/auth.test.ts` to ensure zero persistent test artifacts:
- **Test User Isolation:** User `valid_trader_prod@marketpulse.ai` (`usr-prod-regular-test`) is deterministically purged from `db.store.users` and `db.store.refresh_tokens` within a `finally` block.
- **Token Rotation Isolation:** Rotation test user `usr-test-rotation` and all generated tokens are cleaned up in `finally`.
- **Shared State Restoration:** `config.isProduction` is backed up before every test and restored in `finally`.
- **Database Non-Destructiveness:** Operational records and tables are left completely untouched.
