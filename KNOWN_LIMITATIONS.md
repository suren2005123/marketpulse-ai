# MarketPulse AI — Known Limitations & Operational Boundaries
**Release Version:** 2.0.0 (Enterprise Release)  
**Regulatory Context:** Educational & Analytical Compliance (SEBI / Indian Equities)

---

## 1. Regulatory & Financial Advisory Limitations

1. **Non-Advisory Mandate:** MarketPulse AI is exclusively an educational analytics and algorithmic price monitoring platform. It is **not** a registered investment advisor, portfolio manager, or automated execution broker under SEBI regulations.
2. **Zero Return Guarantee:** The platform explicitly disclaims any promise of trading profits, guaranteed returns, or infallible directional predictions. Stock market investments are inherently subject to market volatility and principal risk.
3. **Model Limitations:** Rolling forecasts (1m, 5m, 15m) represent empirical statistical projections conditioned on historical closed candle distributions. Unforeseen macroeconomic announcements, geopolitical disruptions, regulatory rulings, or breaking news events can cause rapid divergence from predicted intervals.

---

## 2. Market Data & Broker Boundaries

### Upstox V3 Live Streaming
- **Daily OAuth Expiration:** In accordance with Indian regulatory mandates (SEBI/NSE cybersecurity circulars), broker API access tokens expire daily. An operator must re-authenticate the Upstox session each morning prior to market open (09:15 IST).
- **100-Instrument Connection Ceiling:** Upstox limits individual streamer connections to 100 concurrent instrument subscriptions. While the platform incorporates an LRU priority eviction algorithm to manage subscriptions gracefully, simultaneous multi-client viewing of more than 100 distinct equities requires establishing multiple broker connection pools.
- **Off-Market Hours:** When markets are closed (15:30 to 09:15 IST and trading holidays), the live feed remains idle and last closing prices are displayed.

### TejHQ EOD Bhavcopy
- **End-of-Day Nature:** TejHQ delivers official exchange closing bhavcopy data. Bhavcopy files are compiled and published by NSE/BSE following market close (typically between 18:00 and 20:30 IST). Consequently, TejHQ cannot be used for intraday minute-by-minute streaming.

---

## 3. Statistical Anomaly Detection Boundaries

1. **Information Asymmetry:** The Market Move Investigator cross-references quantitative market outliers with official corporate filings and exchange disclosures. In cases where an equity moves violently without an accompanying public filing (e.g., rumor-driven trading, unannounced institutional block deals, or speculative retail flows), the system deliberately outputs:
   ```
   CAUSE_CANNOT_BE_ESTABLISHED: In strict compliance with financial integrity standards, cause cannot be definitively established from company fundamentals alone.
   ```
   The engine refuses to fabricate speculative rationales.
2. **Illiquid Penny Stocks:** Low-volume equities exhibiting sporadic trading volume may trigger false-positive volatility anomalies due to wide bid-ask spreads. The engine applies a baseline volume threshold filter to mitigate this behavior.

---

## 4. Hardware & Scaling Limits

- **Local Embedded Mode:** When PostgreSQL is unconfigured or offline, the platform automatically utilizes an in-memory cache mirror with debounced disk persistence (`marketpulse_db.json`). While highly responsive for single-user development, enterprise production multi-instance clustering requires dedicated PostgreSQL 18 and Redis instances.
- **Browser Memory:** The frontend catalogue incorporates server-side pagination (25 to 100 stocks per page) specifically to avoid loading all 9,668 stock charts into browser DOM memory simultaneously.
