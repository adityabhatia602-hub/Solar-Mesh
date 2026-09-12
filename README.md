# SolarMesh ☀️⚡

**Optimization-Driven, Network-Aware P2P Solar Energy Trading Marketplace.**

> A network-aware P2P solar trading platform demonstrated using a realistic **digital twin** of distributed solar devices and a distribution grid. The market engine, matching, settlement, and wallets are real application logic; telemetry and grid physics are simulated — designed for future smart-meter/IoT and utility integration.

Neighbors trade surplus rooftop solar with each other. A matching engine settles every trade **network-aware**: it finds the cheapest physical delivery path with Dijkstra, computes multiplicative line losses, refuses to exceed line capacity, and settles both wallets atomically — all streamed live to the browser.

---

## Problem

Rooftop solar owners export surplus power to the grid for pennies while their neighbors buy it back at retail. P2P trading fixes the economics but ignores physics: matching *Seller → Buyer* by price alone ignores **where** the energy must physically flow. Long, congested delivery paths waste energy as line losses and can overload local feeders.

## Solution

SolarMesh matches **Seller → Grid → Buyer**:

```
Telemetry (digital twin)          Market                 Network-aware matching
├─ solar curve                    ├─ SELL offers         ├─ Dijkstra shortest path
├─ load profile                   ├─ BUY bids            ├─ line loss (multiplicative)
├─ battery (SOC)                  ├─ escrowed funds      ├─ capacity per edge
└─ voltage/current      ────────► └─ auto + manual       ├─ congestion penalties
   surplus / deficit               orders       ────────► └─ delivery cost
        │                                                      │
        ▼                                                      ▼
  auto SELL / BUY orders                               trade + settlement
   (one per user/node/side)                       (atomic wallets + ledger)
                                                               │
                                                               ▼
                                              live WebSocket → dashboard
```

Every trade stores a full **explanation**: which checks passed, the route taken, energy sent vs delivered, losses, network cost, and a plain-English reason — surfaced in the UI receipt.

## Architecture

```
┌──────────────────────────┐        REST + WebSocket         ┌──────────────────────────┐
│  FRONTEND (React 19)     │ ◄──────────────────────────────► │  BACKEND (FastAPI)       │
│  Vite · Tailwind         │   JWT auth · JSON APIs           │  Auth · Wallets · Grid   │
│  Recharts · Router       │   /ws/live event stream          │  Market · Telemetry      │
└──────────────────────────┘                                  │  Simulation · Analytics  │
                                                              └───────────┬──────────────┘
                                            ┌────────────────────────────┼───────────────┐
                                            ▼                            ▼               ▼
                                   TelemetryProvider             Matching Engine   Grid Engine
                                   (Simulation today,            - Dijkstra        - Digital twin
                                    MQTT/IoT tomorrow)           - Loss            - Loads
                                                                 - Capacity        - Congestion
                                                                 - Congestion      - Events
                                            └────────────────────────────┬───────────────┘
                                                                         ▼
                                                          SQLAlchemy 2.0 — SQLite / PostgreSQL
```

## Tech Stack

- **Frontend** (`solarmesh-frontend`): React 19, Vite, Tailwind CSS, Lucide icons, Recharts, React Router.
- **Backend** (`solarmesh-backend`): FastAPI, SQLAlchemy 2.0, JWT auth, WebSocket live events, Dijkstra matching engine.
- **Database**: SQLite out-of-the-box (no Docker) · PostgreSQL via `DATABASE_URL` for production.

## Digital Twin — what is simulated vs real

| Real application logic | Simulated digital twin |
|---|---|
| User accounts, JWT auth, roles | Solar generation (deterministic curve, capacity-bounded) |
| Wallets, escrow, atomic settlement, ledger | Household consumption (morning/evening peaks) |
| Order book, market orders, price matching | Battery (bounded charge/discharge power, SOC 0–100%) |
| Dijkstra routing, loss math, congestion rejection | Grid topology, line capacity/load, congestion |
| Trade records + match explanations | Device readings (voltage, current, SOC) |

The UI labels simulated data as **"Simulated Digital Twin"** — never as live utility data. A real smart meter or utility feed can replace the simulator by implementing the `TelemetryProvider` / `GridDataProvider` interfaces (see `app/providers/`) without touching the market engine.

## Telemetry

A single controllable simulation loop (start/stop/tick via API or UI) ticks every 4s: generate readings → save → detect surplus/deficit → create/refresh auto orders → match → settle → broadcast. Solar follows a bell curve (0 at night, peak midday, capped by device capacity), load follows morning/evening peaks, batteries charge on surplus and discharge on deficit with bounded power. Auto orders never duplicate: one active order per user+node+side, quantity refreshed in place.

## Matching Engine

For each BUY bid, candidate SELL offers are ranked by **delivered cost** = `ask + network_cost(seller_node → buyer_node)`:

1. **Price check** — the bid must cover ask + network delivery cost.
2. **Dijkstra** — least-cost path over loss + congestion penalties; edges lacking spare capacity (`capacity_kw − load_kw` below the transfer size) are excluded so the engine **reroutes around congestion or rejects the trade — never silently exceeding capacity**.
3. **Line loss** — multiplicative along the path: `delivered = sent × Π(1 − loss_edge)`.
4. **Capacity reservation** — the transfer adds load to every edge on the route.
5. **Settlement** — buyer pays `ask×qty + network_fee×qty`, seller receives `ask×qty`, all atomically with ledger rows.

## Demo Flow (judges' script)

1. Login as `admin@demo.io` (password `password123`) → open **Grid**: 6 nodes, 7 corridors.
2. Open **Simulation Controls** (bottom-right drawer) → **Start**.
3. Watch **Telemetry**: solar ramps up, battery charges, surplus appears.
4. **Marketplace**: auto SELL orders (Alice, Bob) and auto BUY bids (Carol) appear.
5. The matcher executes trades — open a trade receipt to see **route hops, energy sent vs delivered, loss %, network fee**, and the checklist explaining *why this trade was selected*.
6. **Wallets** update atomically; **Analytics** charts grow from real data.
7. **Stop** and re-**Start** the simulation — everything resumes cleanly.

Demo accounts: `alice@demo.io` (prosumer), `bob@demo.io` (prosumer), `carol@demo.io` (consumer), `admin@demo.io` (admin) — all `password123`.

## Installation

### Backend

```bash
cd solarmesh-backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m scripts.seed          # idempotent demo seed
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs · Health: http://localhost:8000/health

### Frontend

```bash
cd solarmesh-frontend
npm install --legacy-peer-deps
npm run dev                     # http://localhost:5173
```

Environment (see `.env`): `VITE_API_BASE_URL=http://localhost:8000`, `VITE_WS_URL=ws://localhost:8000/ws/live`.

### Tests

```bash
cd solarmesh-backend
pytest -q                       # 38 tests, SQLite, no server needed
python tests/e2e_demo.py        # 34-check live demo-flow verification
```

## Deployment

- **Frontend** → Vercel (`solarmesh-frontend` as root, Vite preset, `npm run build` → `dist`; set `VITE_API_BASE_URL` and `VITE_WS_URL`).
- **Backend** → Render/Railway/Fly as a Python service: build `pip install -r requirements.txt && python -m scripts.seed`, start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, set `DATABASE_URL` (e.g. Neon/Supabase Postgres) and a strong `SECRET_KEY`.

## Honest-data statement

The MVP uses **simulated digital-twin telemetry and grid data**. It is designed for future smart-meter/IoT and utility integration — the entire physical layer is swappable behind stable provider interfaces, and every market/routing/settlement function is production-shaped application logic running against a real database.
