# MarketPulse AI — Environment Configuration Reference Manual
**Security Level:** Confidential Template — Do not commit actual `.env` files to source control.

---

## 1. Environment Variable Dictionary

| Variable Name | Type | Default | Required in Production | Description |
| :--- | :---: | :---: | :---: | :--- |
| `NODE_ENV` | `string` | `'development'` | **YES** | Environment tier (`'development'` or `'production'`). Controls security guards and logging. |
| `PORT` | `number` | `5000` | Optional | Backend HTTP/WebSocket listen port. |
| `FRONTEND_PORT` | `number` | `5173` | Optional | Frontend Vite dev server port. |
| `FRONTEND_URL` | `url` | `http://localhost:5173` | **YES** | Whitelisted origin for CORS and Socket.IO handshake validation. |
| `BACKEND_URL` | `url` | `http://localhost:5000` | **YES** | Backend base URL for external webhooks and client configuration. |
| `APP_MODE` | `string` | `'SIMULATED'` | **YES** | Market data source tier: `'SIMULATED'`, `'END_OF_DAY'`, `'LIVE'`, or `'HISTORICAL_REPLAY'`. |
| `JWT_ACCESS_SECRET` | `string` | *Dev fallback* | **CRITICAL** | Cryptographic secret for signing short-lived access tokens. **Dev fallback strictly forbidden in production.** |
| `JWT_REFRESH_SECRET` | `string` | *Dev fallback* | **CRITICAL** | Cryptographic secret for verifying refresh tokens. **Dev fallback strictly forbidden in production.** |
| `JWT_ACCESS_EXPIRES_IN` | `string` | `'15m'` | Optional | Lifetime of access token (e.g., `'15m'`, `'30m'`). |
| `JWT_REFRESH_EXPIRES_IN` | `string` | `'30d'` | Optional | Maximum lifetime of refresh token session. |
| `COOKIE_SECURE` | `boolean` | `false` | **YES** | When `true` (or when `NODE_ENV=production`), refresh token cookies are served with the `Secure` flag (HTTPS only). |
| `LOGIN_MAX_ATTEMPTS` | `number` | `5` | Optional | Maximum consecutive failed login attempts permitted before account lockout. |
| `LOGIN_LOCKOUT_MINUTES`| `number` | `15` | Optional | Lockout duration in minutes following repeated failed login attempts. |
| `DATABASE_URL` | `string` | *Local SQLite* | **YES** | Full PostgreSQL connection URI. |
| `DB_PASSWORD` | `string` | `""` | Optional | Discrete database password override if not embedded in `DATABASE_URL`. |
| `DB_SSL` | `boolean` | `false` | Cloud Only | Enable SSL/TLS for cloud PostgreSQL instances (e.g., AWS RDS, Supabase). |
| `MARKET_DATA_PROVIDER`| `string` | `'tejhq'` | **YES** | Primary market data provider: `'tejhq'`, `'upstox'`, or `'simulated'`. |
| `TEJHQ_BASE_URL` | `url` | `https://api.tejhq.dev` | If TejHQ used | Base endpoint for daily closing bhavcopy and historical candles. |
| `UPSTOX_API_VERSION` | `string` | `'v3'` | If Upstox used| Upstox API specification version. |
| `UPSTOX_CLIENT_ID` | `string` | `""` | If Live Upstox| OAuth 2.0 API Key issued by Upstox Developer Console. |
| `UPSTOX_CLIENT_SECRET`| `string` | `""` | If Live Upstox| OAuth 2.0 API Secret Key issued by Upstox Developer Console. |
| `UPSTOX_REDIRECT_URI` | `url` | `http://localhost:5000/...` | If Live Upstox| Authorized OAuth callback redirect URL. |
| `UPSTOX_ACCESS_TOKEN` | `string` | `""` | If Live Upstox| Daily active authenticated broker session token. |
| `REALTIME_LATENCY_BUDGET_MS`| `number`| `2000` | Optional | Maximum acceptable latency budget SLA threshold for price streams. |

---

## 2. Production Security Fail-Safe Policy

In compliance with enterprise cybersecurity requirements, the backend implements **fail-safe configuration validation** (`validateProductionSecrets` in `backend/src/config/index.ts`).

### Fatal Startup Errors
If `NODE_ENV=production`:
1. If `JWT_ACCESS_SECRET` is undefined, empty, or equals `marketpulse_jwt_access_super_secret_key_2026_dev_env`, backend startup is **aborted immediately**:
   ```
   [SECURITY ERROR] Production startup aborted: Missing or insecure configuration for [JWT_ACCESS_SECRET]. Production environments must supply secure, dedicated secrets and cannot use development fallbacks.
   ```
2. If `JWT_REFRESH_SECRET` is undefined, empty, or equals `marketpulse_jwt_refresh_super_secret_key_2026_dev_env`, backend startup is **aborted immediately**.

### Generating Strong Production Secrets
Generate high-entropy 256-bit cryptographic secrets before deploying to production:
```bash
# Generate Access Secret
openssl rand -base64 48

# Generate Refresh Secret
openssl rand -base64 48
```

---

## 3. Reverse Proxy & HTTPS Configuration

When running behind an enterprise reverse proxy (Nginx, Caddy, Cloudflare, AWS ALB):
- The backend automatically configures `app.set('trust proxy', 1)` when `NODE_ENV=production` to ensure rate limiters correctly inspect client IP headers (`X-Forwarded-For`).
- `COOKIE_SECURE=true` ensures authentication cookies cannot be transmitted over unencrypted HTTP.
- Ensure the reverse proxy forwards `X-Forwarded-Proto: https` to avoid cookie rejection.
