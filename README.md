# SolarMesh ☀️⚡

Optimization-Driven, Network-Aware P2P Solar Energy Trading Marketplace.

Solar prosumers register devices on a distribution grid, post offers to sell surplus solar energy, and consumers bid to buy it. A matching engine settles trades **network-aware**: computing delivery costs (line losses + congestion) with Dijkstra over the distribution grid topology.

---

## Architecture

- **Frontend (`solarmesh-frontend`)**: React 19, Vite, Tailwind CSS, Lucide icons, Recharts, React Router.
- **Backend (`solarmesh-backend`)**: FastAPI, SQLAlchemy 2.0, JWT authentication, WebSockets live event stream, Dijkstra network matching engine.
- **Database**:
  - **Local Development**: SQLite (`solarmesh.db`) out-of-the-box — **No Docker required!**
  - **Production**: PostgreSQL (e.g. Neon, Supabase, Render, AWS RDS) via `DATABASE_URL`.

---

## Local Development (Zero Docker)

### 1. Backend

```bash
cd solarmesh-backend

# Create and activate Python virtual environment (Python 3.10+)
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Seed demo users, grid topology, devices, and orders
python -m scripts.seed

# Start the API (running on http://localhost:8000)
uvicorn app.main:app --reload --port 8000
```

- API Docs: [http://localhost:8000/docs](http://localhost:8000/docs)
- Health check: [http://localhost:8000/health](http://localhost:8000/health)

### 2. Frontend

```bash
cd solarmesh-frontend

# Install dependencies
npm install --legacy-peer-deps

# Start Vite dev server (running on http://localhost:5173)
npm run dev
```

### Demo Accounts (`password: password123`)

| Email | Role | Details |
|---|---|---|
| `alice@demo.io` | Prosumer | 2 devices at Node N4, offer 10 kWh @ $0.12 |
| `bob@demo.io` | Prosumer | 1 device at Node N5, offer 8 kWh @ $0.10 |
| `carol@demo.io` | Consumer | 1 meter at Node N6, bid 5 kWh @ $0.30 |
| `admin@demo.io` | Admin | Grid administration |

---

## Deployment Guide

### Deploying Frontend to Vercel

1. Push your repository to GitHub.
2. In [Vercel](https://vercel.com):
   - Click **Add New Project** and select this repository.
   - Set **Root Directory** to `solarmesh-frontend`.
   - **Framework Preset**: Vite.
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Add Environment Variables in Vercel project settings:
   - `VITE_API_BASE_URL`: URL of your deployed backend (e.g. `https://solarmesh-api.onrender.com`)
   - `VITE_WS_URL`: WebSocket URL of your deployed backend (e.g. `wss://solarmesh-api.onrender.com/ws/live`)
4. Click **Deploy**. Vercel SPA routing is already configured in [`solarmesh-frontend/vercel.json`](file:///Users/kushshah/Solar-Mesh-1/solarmesh-frontend/vercel.json).

### Deploying Backend & Database (No Docker required)

1. **Database**: Create a free PostgreSQL database on [Neon](https://neon.tech) or [Supabase](https://supabase.com). Copy the connection URI.
2. **Backend Web Service**: Deploy `solarmesh-backend` to [Render](https://render.com), [Railway](https://railway.app), or [Fly.io] as a standard Python service:
   - **Root Directory**: `solarmesh-backend`
   - **Build Command**: `pip install -r requirements.txt && python -m scripts.seed`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Environment Variables**:
     - `DATABASE_URL`: Your PostgreSQL connection string from Neon / Supabase
     - `SECRET_KEY`: A secure random secret string
