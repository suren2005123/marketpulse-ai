# MarketPulse AI — Setup & Installation Guide
**Operating System:** Windows 10/11, macOS, or Linux (Ubuntu 22.04+)  
**Node.js Version:** >= 20.x  
**Database:** PostgreSQL 16 or 18

---

## 1. Prerequisites

Before installing MarketPulse AI, ensure the following dependencies are installed on your workstation or server:

| Requirement | Minimum Version | Recommended | Verification Command |
| :--- | :---: | :---: | :--- |
| **Node.js** | `v20.0.0` | `v20.18.x LTS` | `node -v` |
| **npm** | `v10.0.0` | `v10.8.x` | `npm -v` |
| **PostgreSQL** | `16.x` | `18.x` | `psql -V` |
| **Python** *(optional)* | `3.10` | `3.11` | `python --version` |

---

## 2. Step-by-Step Installation

### Step 1: Clone Repository & Open Terminal
```powershell
cd "F:\KD project 2026 NOV"
```

### Step 2: Install Workspace Dependencies
The project uses an npm workspaces monorepo structure. Run from the workspace root:
```powershell
npm install
```
This automatically installs all dependencies across `backend` and `frontend`.

### Step 3: Configure Environment Variables
Copy `.env.example` to `.env` in the project root:
```powershell
# Windows PowerShell
Copy-Item .env.example .env

# macOS / Linux
cp .env.example .env
```
Edit `.env` and configure your local PostgreSQL credentials:
```env
# Database Connection (PostgreSQL 18)
DATABASE_URL=postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/marketpulse

# Port Settings
PORT=5000
FRONTEND_PORT=5173

# Application Data Mode (SIMULATED, END_OF_DAY, LIVE, HISTORICAL_REPLAY)
APP_MODE=SIMULATED
NODE_ENV=development
```

### Step 4: Run Database Migrations
Run the database migration runner to verify or create the 13 required relational tables:
```powershell
npm run db:migrate --workspace=backend
```
*Expected Output:*
```text
=============================================================
 MarketPulse AI — Database Migration Runner
=============================================================
[DB] Connected successfully to PostgreSQL.
[Migration] Found 13 tables in PostgreSQL:
  - broker_partners (0 rows)
  - forecast_evaluations (0 rows)
  - forecasts (0 rows)
  - instruments (9668 rows)
  ...
Migration completed successfully!
```

### Step 5: Seed Instrument Catalogue & Demo Account
Populate initial equities, default user accounts, and sample trading candles:
```powershell
npm run db:seed --workspace=backend
```

---

## 3. Running Development Services

MarketPulse AI runs across two primary processes:

### Terminal 1: Backend Server (Port 5000)
```powershell
npm run dev:backend
```
The backend initializes the Express HTTP API, mounts all routes (`/api/*`), connects to PostgreSQL, loads the 9,668 stock catalogue into cache, and initializes the Socket.IO WebSocket engine.

### Terminal 2: Frontend Client (Port 5173)
```powershell
npm run dev:frontend
```
The React 18 client launches at `http://localhost:5173`.

---

## 4. Verifying Installation Health

1. **Backend Health Check:** Open a browser or terminal and request:
   ```powershell
   curl http://localhost:5000/api/health
   ```
   *Expected Response:*
   ```json
   {
     "status": "HEALTHY",
     "uptime": 12.4,
     "database": "PostgreSQL",
     "activeEquities": 9668,
     "dataMode": "SIMULATED"
   }
   ```
2. **Frontend UI:** Navigate to `http://localhost:5173`. You should see the Dark Theme MarketPulse AI dashboard with live stock ticker updates and the NSE/BSE catalogue.

---

## 5. Development Credentials

In local development (`NODE_ENV=development`), you can immediately sign in via the **One-Click Demo Account Login** button on `/login` or by entering:
- **Email:** `demo@marketpulse.ai`
- **Password:** `DemoPassword123!`
- **Role:** `admin`

> [!NOTE]
> The demo button and login credentials are strictly rejected in production (`NODE_ENV=production`) with HTTP 401 `DEMO_DISABLED`.
