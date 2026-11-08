# MarketPulse AI — Database Schema & Data Integrity Manual
**RDBMS:** PostgreSQL 18 (with In-Memory Embedded Fallback Cache)  
**Database Name:** `marketpulse`  
**Schema:** `public` (13 Relational Tables)

---

## 1. Schema Diagram & Relationships

```
┌──────────────────┐       ┌────────────────────────┐
│      users       │◄──────┤     refresh_tokens     │
│ (PK: id)         │       │ (FK: user_id)          │
└────────┬─────────┘       └────────────────────────┘
         │
         ├─────────────────►┌────────────────────────┐
         │                  │    user_preferences    │
         │                  │ (PK/FK: user_id)       │
         │                  └────────────────────────┘
         │
         ├─────────────────►┌────────────────────────┐
         │                  │    learning_progress   │
         │                  │ (FK: user_id)          │
         │                  └────────────────────────┘
         │
         ├─────────────────►┌────────────────────────┐
         │                  │     user_watchlists    │
         │                  │ (FK: user_id)          │
         │                  └───────────┬────────────┘
         │                              │
         ├──────────────────────────────┼────────────┐
         ▼                              ▼            ▼
┌──────────────────┐       ┌────────────────────────┐│
│   instruments    │◄──────┤      price_alerts      ││
│ (PK: id)         │       │ (FK: instrument_id)    ││
└────────┬─────────┘       └────────────────────────┘│
         │                                           │
         ├─────────────────►┌────────────────────────┐
         │                  │     market_candles     │
         │                  │ (FK: instrument_id)    │
         │                  └────────────────────────┘
         │
         ├─────────────────►┌────────────────────────┐
         │                  │       forecasts        │
         │                  │ (FK: instrument_id)    │
         │                  └───────────┬────────────┘
         │                              │
         │                              ▼
         │                 ┌────────────────────────┐
         │                 │  forecast_evaluations  │
         │                 │ (FK: forecast_id)      │
         │                 └────────────────────────┘
         │
         ├─────────────────►┌────────────────────────┐
         │                  │   stock_explanations   │
         │                  │ (FK: instrument_id)    │
         │                  └────────────────────────┘
         │
         └─────────────────►┌────────────────────────┐
                            │     trend_analyses     │
                            │ (FK: instrument_id)    │
                            └────────────────────────┘

┌────────────────────────┐
│    broker_partners     │
│ (PK: id)               │
└────────────────────────┘
```

---

## 2. Table Specifications

### 1. `users`
Stores authenticated user accounts and RBAC roles.
- `id` (`VARCHAR(36)`): Primary Key (UUID).
- `email` (`VARCHAR(255)`): Unique, indexed, case-normalized user email address.
- `password_hash` (`VARCHAR(255)`): Salted bcrypt password hash (work factor 10).
- `display_name` (`VARCHAR(100)`): User's profile display name.
- `role` (`VARCHAR(20)`): Access control role (`'user'` | `'admin'`). Default `'user'`.
- `email_verified` (`BOOLEAN`): Default `false`.
- `created_at` (`TIMESTAMPTZ`): Creation timestamp.
- `last_login_at` (`TIMESTAMPTZ`): Timestamp of most recent successful authentication.

### 2. `refresh_tokens`
Enforces cryptographic token rotation and session reuse detection.
- `id` (`VARCHAR(36)`): Primary Key (UUID).
- `user_id` (`VARCHAR(36)`): Foreign Key `REFERENCES users(id) ON DELETE CASCADE`.
- `token_hash` (`VARCHAR(255)`): SHA-256 hash of the 40-byte cryptographically secure random token string.
- `issued_at` (`TIMESTAMPTZ`): Timestamp issued.
- `expires_at` (`TIMESTAMPTZ`): Token validity horizon (typically 30 days).
- `revoked_at` (`TIMESTAMPTZ`): Timestamp when rotated or manually revoked.
- `replaced_by_token_id` (`VARCHAR(36)`): Audit pointer to the superseding token ID.

### 3. `instruments`
The master catalogue containing 9,668 active Indian equities.
- `id` (`VARCHAR(36)`): Primary Key.
- `exchange` (`VARCHAR(10)`): Listing exchange (`'NSE'` | `'BSE'`).
- `symbol` (`VARCHAR(30)`): Exchange ticker symbol (e.g., `'RELIANCE'`, `'TCS'`).
- `name` (`VARCHAR(150)`): Official registered corporate entity name.
- `sector` (`VARCHAR(100)`): Industry categorization (e.g., `'Energy & Retail'`, `'Information Technology'`).
- `provider_instrument_key` (`VARCHAR(100)`): Upstox/TejHQ provider mapping key (`'NSE_EQ|INE002A01018'`).
- `active` (`BOOLEAN`): Default `true`. Filter flag for actively traded equities.
- **Constraints**: `UNIQUE(exchange, symbol)`.

### 4. `market_candles`
Time-series storage for OHLCV pricing bars.
- `id` (`VARCHAR(36)`): Primary Key.
- `instrument_id` (`VARCHAR(36)`): Foreign Key `REFERENCES instruments(id)`.
- `candle_start` (`TIMESTAMPTZ`): Beginning of the aggregation interval.
- `interval` (`VARCHAR(10)`): Timeframe (`'1m'`, `'5m'`, `'15m'`, `'1d'`). Default `'1m'`.
- `open`, `high`, `low`, `close` (`NUMERIC(12, 2)`): Standard OHLC values.
- `volume` (`BIGINT`): Traded volume count during interval.
- `source_mode` (`VARCHAR(20)`): `'LIVE'` | `'SIMULATED'` | `'END_OF_DAY'` | `'HISTORICAL_REPLAY'`.
- `provider` (`VARCHAR(50)`): Data provider tag (`'upstox'`, `'tejhq'`, `'simulated'`).
- `received_at` (`TIMESTAMPTZ`): Ingestion timestamp.
- **Index**: `CREATE INDEX idx_candles_time ON market_candles(instrument_id, candle_start DESC);`

### 5. `forecasts`
Rolling statistical predictions generated across horizons.
- `id` (`VARCHAR(36)`): Primary Key.
- `instrument_id` (`VARCHAR(36)`): Foreign Key `REFERENCES instruments(id)`.
- `issued_at` (`TIMESTAMPTZ`): Timestamp of forecast issuance.
- `target_time` (`TIMESTAMPTZ`): Future time point of prediction horizon.
- `horizon_minutes` (`INT`): `1`, `5`, or `15`.
- `anchor_price` (`NUMERIC(12, 2)`): Price at the moment of prediction.
- `predicted_price` (`NUMERIC(12, 2)`): Estimated future price point.
- `lower_bound`, `upper_bound` (`NUMERIC(12, 2)`): 80% or 90% empirical prediction interval bounds.
- `probability_up` (`NUMERIC(6, 4)`): Directional upward probability ($0.0000$ to $1.0000$).
- `model_version` (`VARCHAR(50)`): Model identifier (e.g., `'mp-lstm-v2.1'`).
- `source_mode` (`VARCHAR(20)`): Source mode at inference time.
- `evaluation_status` (`VARCHAR(20)`): `'PENDING'` | `'EVALUATED'` | `'EXPIRED'`.
- **Index**: `CREATE INDEX idx_forecasts_target ON forecasts(instrument_id, target_time DESC);`

### 6. `forecast_evaluations`
Audit records comparing predicted vs. actual realized prices.
- `id` (`VARCHAR(36)`): Primary Key.
- `forecast_id` (`VARCHAR(36)`): Foreign Key `REFERENCES forecasts(id) ON DELETE CASCADE`.
- `actual_price` (`NUMERIC(12, 2)`): Actual market close at `target_time`.
- `absolute_error` (`NUMERIC(12, 2)`): $|predicted - actual|$.
- `directional_correctness` (`BOOLEAN`): True if sign of predicted return matched realized return.
- `inside_interval` (`BOOLEAN`): True if $lower\_bound \le actual \le upper\_bound$.
- `evaluation_timestamp` (`TIMESTAMPTZ`): Time audit was performed.

### 7. `user_watchlists`
- `user_id` (`VARCHAR(36)`): `REFERENCES users(id) ON DELETE CASCADE`.
- `instrument_id` (`VARCHAR(36)`): `REFERENCES instruments(id) ON DELETE CASCADE`.
- `added_at` (`TIMESTAMPTZ`): Addition timestamp.
- **Primary Key**: `(user_id, instrument_id)`.

### 8. `price_alerts`
- `id` (`VARCHAR(36)`): Primary Key.
- `user_id` (`VARCHAR(36)`): `REFERENCES users(id) ON DELETE CASCADE`.
- `instrument_id` (`VARCHAR(36)`): `REFERENCES instruments(id) ON DELETE CASCADE`.
- `condition_type` (`VARCHAR(50)`): `'PRICE_ABOVE'` | `'PRICE_BELOW'` | `'PERCENT_CHANGE_SPIKE'`.
- `threshold` (`NUMERIC(12, 2)`): Trigger value.
- `active` (`BOOLEAN`): Alert trigger state. Default `true`.
- `triggered_at` (`TIMESTAMPTZ`): Moment condition was fulfilled.
- **Index**: `CREATE INDEX idx_alerts_user ON price_alerts(user_id, active);`

### 9. `stock_explanations`
- `id` (`VARCHAR(64)`): Primary Key.
- `instrument_id` (`VARCHAR(36)`): `REFERENCES instruments(id) ON DELETE CASCADE`.
- `symbol`, `exchange`: Listing details.
- `trend_classification` (`VARCHAR(20)`): `'BULLISH'` | `'BEARISH'` | `'NEUTRAL'`.
- `indicators` (`JSONB`): Calculated indicator values at generation time.
- `beginner_summary`, `advanced_summary` (`TEXT`): Summaries.
- `facts`, `interpretations` (`JSONB`): Fact-vs-hypothesis separation.
- `timeframe` (`VARCHAR(10)`): Default `'15m'`.
- `source_mode` (`VARCHAR(20)`): Feed status tag.
- `generated_at` (`TIMESTAMPTZ`): Creation timestamp.
- **Index**: `CREATE INDEX idx_explanations_inst ON stock_explanations(instrument_id, generated_at DESC);`

### 10. `trend_analyses`
- `id` (`VARCHAR(64)`): Primary Key.
- `instrument_id` (`VARCHAR(36)`): `REFERENCES instruments(id) ON DELETE CASCADE`.
- `symbol`, `exchange`, `timeframe`: Context parameters.
- `classification` (`VARCHAR(20)`): Market regime identifier.
- `confidence_score` (`NUMERIC(5, 2)`): Quantitative score ($0.00$ to $100.00$).
- `indicators`, `supporting_evidence` (`JSONB`): Audit trails.
- `analyzed_at` (`TIMESTAMPTZ`): Timestamp.
- **Index**: `CREATE INDEX idx_trends_inst ON trend_analyses(instrument_id, timeframe, analyzed_at DESC);`

### 11. `learning_progress`
- `id` (`VARCHAR(64)`): Primary Key.
- `user_id` (`VARCHAR(36)`): `REFERENCES users(id) ON DELETE CASCADE`.
- `topic_id` (`VARCHAR(50)`): Educational topic key.
- `completed` (`BOOLEAN`): Completion status.
- `quiz_score` (`NUMERIC(5, 2)`): Quiz score percentage.
- `last_viewed_at` (`TIMESTAMPTZ`): Timestamp.
- **Constraints**: `UNIQUE(user_id, topic_id)`.

### 12. `user_preferences`
- `user_id` (`VARCHAR(36)`): Primary Key `REFERENCES users(id) ON DELETE CASCADE`.
- `analysis_mode` (`VARCHAR(20)`): `'BEGINNER'` | `'ADVANCED'`.
- `default_timeframe` (`VARCHAR(10)`): Default `'15m'`.
- `favorite_indicators` (`JSONB`): Preferred indicator array.
- `learning_level` (`VARCHAR(20)`): User experience tier.
- `updated_at` (`TIMESTAMPTZ`): Modification time.

### 13. `broker_partners`
- `id` (`VARCHAR(64)`): Primary Key.
- `partner_name`, `partner_code`: Identifier details.
- `api_key_hash`: Hashed secret key.
- `allowed_origins` (`JSONB`): CORS whitelist.
- `active` (`BOOLEAN`): Default `true`.

---

## 3. Data Integrity & Migration Execution Policy

1. **Non-Destructive Migrations**: The migration runner (`backend/src/db/migrate.ts`) executes `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`. Tables, sequences, and operational data are **never dropped or truncated**.
2. **Upsert De-Duplication**: Candle insertion uses unique compound indexing and `ON CONFLICT (instrument_id, interval, candle_start) DO UPDATE` to prevent duplicate bars.
3. **Automatic Mirror Sync**: If PostgreSQL is temporarily offline during development, the application operates against the high-performance local store and syncs back upon database re-establishment.
