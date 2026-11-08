# MarketPulse AI — REST & WebSocket API Specification
**Base URL:** `http://localhost:5000/api` (Development) | `https://api.marketpulse.ai/api` (Production)  
**Authentication Scheme:** Dual-token JWT. Short-lived Access Token in `Authorization: Bearer <token>` header; Long-lived Refresh Token in secure `HttpOnly` cookie.

---

## 1. Authentication Endpoints (`/api/auth`)

### `POST /api/auth/login`
Authenticates a user with email and password.
- **Request Body:**
  ```json
  {
    "email": "trader@example.com",
    "password": "StrongPassword123!"
  }
  ```
- **Responses:**
  - `200 OK`: Successful authentication.
    ```json
    {
      "message": "Login successful",
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "user": {
        "id": "usr-12345",
        "email": "trader@example.com",
        "displayName": "Professional Trader",
        "role": "user"
      }
    }
    ```
    *Cookie Set:* `refreshToken=<hash>; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`
  - `401 Unauthorized (DEMO_DISABLED)`: In production, attempts to use `demo@marketpulse.ai` are explicitly rejected.
    ```json
    {
      "code": "DEMO_DISABLED",
      "error": "Demo account is disabled in production environments."
    }
    ```
  - `429 Too Many Requests`: 5 failed attempts trigger a 15-minute lockout.

### `POST /api/auth/refresh`
Rotates the refresh token and returns a new access token.
- **Headers:** Automatically includes `Cookie: refreshToken=...`
- **Response `200 OK`:** Returns new `accessToken`.

### `POST /api/auth/logout`
Revokes the refresh token and clears the authentication cookie.

---

## 2. Market Catalogue & Equities (`/api/stocks` or `/api/market`)

### `GET /api/stocks`
Retrieves paginated equities with real-time quote metrics and filtering.
- **Query Parameters:**
  - `page` (integer, default `1`): Current page number.
  - `limit` (integer, default `25`, max `100`): Items per page.
  - `search` (string, optional): Search query matching ticker symbol or company name.
  - `exchange` (string, optional): `ALL`, `NSE`, or `BSE`.
  - `sortBy` (string, optional): `symbol`, `name`, `last_price`, `change_percent`.
  - `sortOrder` (string, optional): `asc` or `desc`.
- **Response `200 OK`:**
  ```json
  {
    "data": [
      {
        "id": "inst-rel",
        "symbol": "RELIANCE",
        "name": "Reliance Industries Ltd",
        "exchange": "NSE",
        "sector": "Energy & Retail",
        "lastPrice": 2940.50,
        "changePercent": 1.25,
        "volume": 4521090,
        "sourceMode": "SIMULATED"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "pageSize": 25,
      "totalRecords": 9668,
      "totalPages": 387
    }
  }
  ```

### `GET /api/stocks/:id/candles`
Historical OHLCV candle data for charting.
- **Query Parameters:**
  - `timeframe` (string, default `15m`): `1m`, `5m`, `15m`, `1d`.
  - `limit` (integer, default `100`, max `500`): Number of candles.
- **Response `200 OK`:** Array of candles chronologically sorted (`oldest` to `newest`).

---

## 3. Explain My Stock (`/api/explain`)

### `GET /api/explain/:symbol`
Produces quantitative analysis, fact-vs-hypothesis separation, and bilingual beginner/advanced explanations.
- **Path Parameters:**
  - `symbol` (string): Equity ticker symbol (e.g., `RELIANCE`).
- **Response `200 OK`:**
  ```json
  {
    "symbol": "RELIANCE",
    "exchange": "NSE",
    "trendClassification": "BULLISH",
    "indicators": {
      "rsi": 62.4,
      "macd": { "macdLine": 8.5, "signalLine": 6.2, "histogram": 2.3 },
      "ema20": 2910.0,
      "ema50": 2865.0
    },
    "beginnerSummary": "Reliance is showing healthy upward momentum backed by solid buyer demand.",
    "advancedSummary": "Price trades comfortably above the 20 and 50 EMAs with RSI expansion.",
    "facts": [
      "20-period EMA exceeds 50-period EMA indicating positive golden trend bias.",
      "Volume multiple of 1.4x reflects above-average trading activity."
    ],
    "interpretations": [
      "Bullish continuation is technically favorable while above 2,890 support."
    ],
    "sourceMode": "SIMULATED"
  }
  ```

---

## 4. Technical Trend Analysis (`/api/trends`)

### `GET /api/trends/:symbol`
Returns technical indicators and trend regime classification.
- **Query Parameters:**
  - `timeframe` (string, default `15m`): `1m`, `5m`, `15m`, `1d`.
- **Response `200 OK`:**
  ```json
  {
    "symbol": "TCS",
    "classification": "NEUTRAL",
    "confidenceScore": 74.5,
    "indicators": {
      "rsi": 49.8,
      "bollingerBands": { "upper": 4200.0, "middle": 4120.0, "lower": 4040.0 },
      "adx": 18.2
    },
    "supportingEvidence": [
      "RSI is range-bound in the neutral 40-60 zone.",
      "ADX below 20 confirms lack of directional trending strength."
    ]
  }
  ```

---

## 5. Learning Companion (`/api/learn`)

### `GET /api/learn/topics`
Retrieves educational modules categorized by skill level (`BEGINNER`, `INTERMEDIATE`, `ADVANCED`).

### `POST /api/learn/quiz/submit`
Submits quiz answers for validation and updates the user's progress.

---

## 6. Market Anomaly Radar (`/api/radar`)

### `GET /api/radar/anomalies`
Returns detected statistical anomalies across the entire catalogue.
- **Query Parameters:**
  - `severity` (optional): `ALL`, `CRITICAL`, `ELEVATED`, `MODERATE`.
  - `limit` (integer, default `20`).
- **Response `200 OK`:**
  ```json
  {
    "summary": {
      "totalAnomalies": 12,
      "criticalCount": 2,
      "elevatedCount": 4,
      "moderateCount": 6
    },
    "anomalies": [
      {
        "id": "anom-001",
        "symbol": "TATAMOTORS",
        "exchange": "NSE",
        "type": "PRICE_SPIKE",
        "severity": "CRITICAL",
        "zScore": 3.42,
        "metricValue": "+5.8%",
        "baselineValue": "0.4%",
        "detectedAt": "2026-11-08T15:20:00Z"
      }
    ]
  }
  ```

---

## 7. AI Market Insights (`/api/insights`)

### `GET /api/insights/overview`
Aggregated macroeconomic and market-wide intelligence.
- **Response `200 OK`:** Returns market breadth (advances/declines), top volume movers, sector performance, and synthetic market commentary.

---

## 8. WebSocket Socket.IO Specification

### Connection & Authentication
- **Endpoint:** `ws://localhost:5000` (or `wss://api.marketpulse.ai`)
- **Query Params:** `auth: { token: "<jwt_access_token>" }`

### Client-to-Server Events
- `subscribe:ticker`: `{ symbol: "RELIANCE", exchange: "NSE" }`
- `unsubscribe:ticker`: `{ symbol: "RELIANCE", exchange: "NSE" }`

### Server-to-Client Events
- `tick`: Real-time market tick payload containing `lastPrice`, `high`, `low`, `volume`, `timestamp`, and `sourceMode`.
- `feed_status`: Heartbeat event emitting `{ provider: "upstox", mode: "LIVE", latencyMs: 142 }`.
- `anomaly:alert`: Emitted when an anomaly is identified on a subscribed watchlist stock.
