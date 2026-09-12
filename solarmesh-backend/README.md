# SolarMesh Backend

FastAPI backend for **SolarMesh — an Optimization-Driven, Network-Aware P2P Solar Energy Trading Marketplace**, demonstrated on a realistic **simulated digital twin** of household solar devices and a distribution grid.

Solar prosumers register devices on the grid, and the simulation detects surplus/deficit from live telemetry to create automatic offers/bids. A matching engine settles trades **network-aware**: the buyer pays the ask price **plus the cost of delivering energy over the grid** (line losses + congestion), computed with Dijkstra over the grid graph — never silently exceeding line capacity.

## Stack

- **FastAPI** (async, auto OpenAPI docs at `/docs`)
- **SQLite** by default (zero setup) · **PostgreSQL** via `DATABASE_URL` (SQLAlchemy 2.0)
- **JWT auth** (access + refresh tokens, bcrypt hashing)
- **WebSocket** live event stream (`/ws/live`)
- **pytest** test suite (38 tests) + an E2E demo-flow script

## Quick start (Zero Docker required)

```bash
# 1. Python env (needs 3.10+)
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt

# 2. Seed demo data (grid, users, devices, wallets, orders) — idempotent
./.venv/bin/python -m scripts.seed

# 3. Run the API
./.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

Interactive API docs: **http://localhost:8000/docs** · Health: **http://localhost:8000/health**

### Demo users (password: `password123`)

| Email | Role | Seeded state |
|---|---|---|
| alice@demo.io | prosumer | Rooftop array 8 kW + battery 10 kWh at N4, offer 10 kWh @ 0.12 |
| bob@demo.io | prosumer | Rooftop array 6 kW at N5, offer 8 kWh @ 0.10 |
| carol@demo.io | consumer | Meter at N6, bid 5 kWh @ 0.30 |
| admin@demo.io | admin | Grid administration, simulation controls |

Each user starts with a $500 wallet balance. Seed is **idempotent** — run it repeatedly without duplicating data. Full reset (deletes everything, then reseeds):

```bash
./.venv/bin/python -m scripts.reset_demo   # requires typing 'reset'
```

## The digital-twin simulation

The simulation loop (one global instance, admin-controlled) periodically executes:

1. **Telemetry** — realistic solar curve (zero at night, capacity-bounded peak midday), household load profile (morning/evening peaks), battery with bounded charge/discharge power and 0–100% SOC, plausible voltage/current.
2. **Surplus/deficit detection** — net export > 0.1 kW → auto SELL order; net import > 0.1 kW → auto BUY order. One active order per user+node+side; quantities refresh in place (no duplicates).
3. **Matching engine** — network-aware double auction (below).
4. **Settlement** — atomic wallet movements with ledger entries.
5. **WebSocket broadcast** — telemetry/trade/grid events to all subscribers.

Control it:

| Endpoint | Who | What |
|---|---|---|
| `GET /api/simulation/status` | anyone | is_running, tick_count, interval |
| `POST /api/simulation/start` | admin | start the loop (interval `SIMULATION_INTERVAL_SECONDS`, default 4s) |
| `POST /api/simulation/stop` | admin | stop the loop |
| `POST /api/simulation/tick` | any user | run 1–20 manual ticks (great for demos) |

### Matching engine economics

- Buyer bids the net amount they want delivered; the **full bid value is reserved** from their wallet immediately.
- For each offer, the engine computes a *delivered cost* = `ask + network_cost(seller_node → buyer_node)` where network cost comes from **capacity-aware Dijkstra**: edges without enough spare `capacity_kw - load_kw` for the transfer are excluded, so the engine reroutes around congestion or rejects the trade.
- Losses are **multiplicative** along the path: `delivered = sent × Π(1 − loss_edge)`. The seller sends gross to cover losses; the buyer's wallet energy counter reflects net delivered kWh.
- Buyer pays `ask×qty + network_cost×qty`; seller receives `ask×qty`. All movements are atomic ledger entries; trade rows store the full route, loss, and an `explanation` object (price check, capacity, route, reason) that powers the frontend explainability panel.

## Architecture

```
app/
  main.py            FastAPI app, CORS, lifespan, router mounting
  config.py          Settings from .env
  db.py              Engine / session / Base + lightweight SQLite migrations
  models.py          User, Wallet, LedgerEntry, Device, GridNode, GridEdge,
                     Order, Trade, Telemetry, SimulationState, GridEvent
  schemas.py         Pydantic request/response models
  security.py        bcrypt + JWT helpers
  dependencies.py    get_current_user, require_admin
  providers/
    telemetry_provider.py  TelemetryProvider ABC + SimulationTelemetryProvider
    grid_provider.py       GridDataProvider ABC + SimulatedGridProvider
  services/
    wallet_service.py      Atomic balance mutation + double-entry ledger
    grid_service.py        Capacity-aware Dijkstra, congestion events, loads
    market_service.py      Orders, auto-order upsert, matcher, settlement
    telemetry_service.py   Ingestion, simulation tick, surplus/deficit logic
    simulation_service.py  Single controllable loop + manual ticks
    settlement_service.py  Reusable atomic settlement primitives
  routers/
    auth.py          /api/auth/*
    wallets.py       /api/wallet/*
    grid.py          /api/grid/*  (nodes, edges, route, devices)
    market.py        /api/market/* (orders incl. /orders/open, orderbook, match)
    telemetry.py     /api/telemetry*, /ws/live
    trades.py        /api/trades/* (detail, admin all)
    simulation.py    /api/simulation/*
    analytics.py     /api/analytics/* (dashboard, grid, market)
scripts/
  seed.py         Idempotent demo seeding
  reset_demo.py   Full demo reset (development only)
tests/            38 pytest tests + e2e_demo.py live-flow verification
```

### Provider abstraction (future IoT / utility integration)

The market engine never touches simulation code directly — it consumes a `TelemetryProvider` / `GridDataProvider` interface. Swapping in an `MQTTTelemetryProvider` (ESP32 / smart meters) or a `UtilityGridProvider` (real SCADA/DMS feed) requires no changes to matching, settlement, or the API contract.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./solarmesh.db` | SQLite or PostgreSQL URL |
| `SECRET_KEY` | dev value | JWT signing — **change in production** |
| `SIMULATION_INTERVAL_SECONDS` | `4.0` | Tick interval (2–120s allowed via API) |
| `MATCH_INTERVAL_SECONDS` | `5` | Background matcher frequency |
| `MAX_ORDER_AGE_HOURS` | `48` | Auto-order expiry |
| `ENERGY_PRICE_FLOOR` / `ENERGY_PRICE_CEIL` | `0.05` / `0.50` | Price clamp helpers |
| `CONGESTION_PENALTY` | `0.15` | Routing cost surcharge above 70% utilization |

## Typical demo flow

1. Login as `admin@demo.io` → **Grid page**: 6 nodes / 7 corridors.
2. Start the simulation (drawer → **Start**, or `POST /api/simulation/start`).
3. Telemetry starts streaming; solar ramps up midday → Alice shows surplus → auto SELL order appears.
4. Carol's meter shows deficit → auto BUY order appears.
5. The matcher pairs them: route `N4 → N2 → N6`, losses computed, capacity reserved, trade settled.
6. Wallets update, WebSocket events fire, the dashboard refreshes live. Open any trade for the full **explainability receipt** (checks + route + loss + reasoning).

## Tests

```bash
./.venv/bin/python -m pytest tests/ -q          # 38 unit/API tests (SQLite, no server needed)
./.venv/bin/python tests/e2e_demo.py            # 34-check live flow (needs a running server)
```

The pytest suite runs against a disposable SQLite DB. The E2E script drives a real server through login → simulation → telemetry → auto orders → matching → settlement → analytics and prints a PASS/FAIL checklist.

## Notes for production hardening

- Alembic migrations instead of `create_all` + lightweight ALTERs.
- Matching engine as a separate worker; Redis pub/sub for multi-worker WebSocket fan-out.
- Restrict CORS origins, add rate limiting, token revocation, and persistent simulation state across restarts.
