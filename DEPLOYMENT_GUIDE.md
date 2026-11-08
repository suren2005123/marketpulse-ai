# MarketPulse AI — Production Deployment & Operations Guide
**Target Environments:** Linux (Ubuntu 22.04 LTS / Debian 12), Docker Containers, AWS / GCP / DigitalOcean  
**Process Manager:** PM2 or Systemd  
**Reverse Proxy:** Nginx or Caddy

---

## 1. Production Architecture Overview

In production, MarketPulse AI deploys as a hardened, multi-tier system:
- **Client Assets:** Static HTML, CSS, and JS built by Vite and served directly by Nginx or Cloudflare CDN.
- **API & Gateway:** Node.js process managed by PM2, bound to `127.0.0.1:5000`.
- **Database:** PostgreSQL 16+ with connection pooling, automated backups, and SSL encryption.
- **Security:** TLS 1.3 encryption, `Strict-Transport-Security`, `HttpOnly` secure cookies, rate limiting, and demo credential lockout.

---

## 2. Pre-Deployment Build Process

### Step 1: Install Dependencies
```bash
npm ci --omit=dev
```

### Step 2: Build Backend TypeScript
```bash
npm run build --workspace=backend
# Generates compiled production files in backend/dist/
```

### Step 3: Build Frontend Production Bundle
```bash
npm run build --workspace=frontend
# Generates minified static assets in frontend/dist/
```
Verify that the demo login button and demo credentials are eliminated from the production JavaScript bundle:
```bash
grep -rn "demo@marketpulse.ai" frontend/dist/
# Output must be empty (0 matches)
```

---

## 3. Production Environment File (`.env.production`)

Create `/opt/marketpulse/.env.production` (or inject as secure container environment variables):
```env
NODE_ENV=production
APP_MODE=END_OF_DAY
PORT=5000
FRONTEND_URL=https://marketpulse.ai
BACKEND_URL=https://api.marketpulse.ai

# Production JWT Secrets (Generate with openssl rand -base64 48)
JWT_ACCESS_SECRET=wK8j3Nm...YOUR_SECURE_GENERATED_ACCESS_KEY
JWT_REFRESH_SECRET=xP9q2Rt...YOUR_SECURE_GENERATED_REFRESH_KEY
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
COOKIE_SECURE=true

# Database (PostgreSQL 18)
DATABASE_URL=postgresql://marketpulse_user:SUPER_STRONG_PASSWORD@db-host:5432/marketpulse
DB_SSL=true

# Market Data Configuration
MARKET_DATA_PROVIDER=tejhq
TEJHQ_BASE_URL=https://api.tejhq.dev

# Rate Limiting
LOGIN_MAX_ATTEMPTS=5
LOGIN_LOCKOUT_MINUTES=15
```

---

## 4. Process Management with PM2

Create `ecosystem.config.js`:
```javascript
module.exports = {
  apps: [
    {
      name: 'marketpulse-backend',
      script: './backend/dist/index.js',
      instances: 'max',
      exec_mode: 'cluster',
      env_production: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '1G',
      error_file: '/var/log/marketpulse/err.log',
      out_file: '/var/log/marketpulse/out.log',
      time: true,
    },
  ],
};
```
Start and monitor backend instances:
```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

---

## 5. Nginx Reverse Proxy Configuration

Configure `/etc/nginx/sites-available/marketpulse.conf`:
```nginx
server {
    listen 80;
    server_name marketpulse.ai api.marketpulse.ai;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name marketpulse.ai;

    ssl_certificate /etc/letsencrypt/live/marketpulse.ai/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/marketpulse.ai/privkey.pem;

    root /opt/marketpulse/frontend/dist;
    index index.html;

    # Static asset caching
    location ~* \.(?:css|js|woff2?|svg|png|jpg|ico)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }
}

server {
    listen 443 ssl http2;
    server_name api.marketpulse.ai;

    ssl_certificate /etc/letsencrypt/live/marketpulse.ai/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/marketpulse.ai/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;

        # WebSocket support for Socket.IO
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Forwarded headers for rate limiting and IP tracking
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

---

## 6. Post-Deployment Smoke Verification

1. **API Health Probe:**
   ```bash
   curl -I https://api.marketpulse.ai/api/health
   # Must return HTTP 200 OK
   ```
2. **Demo Account Lockdown Test:**
   ```bash
   curl -X POST https://api.marketpulse.ai/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"demo@marketpulse.ai","password":"DemoPassword123!"}'
   # Must return HTTP 401 with {"code":"DEMO_DISABLED"}
   ```
3. **Cookie Security Verification:**
   Ensure returned `Set-Cookie` header includes `HttpOnly; Secure; SameSite=Strict`.
