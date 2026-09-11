# SolarMesh Backend

Production-quality MVP backend for **SolarMesh — an Optimization-Driven, Network-Aware P2P Solar Energy Trading Marketplace**.

Solar prosumers register devices on a modeled distribution grid, post offers to sell surplus solar energy, and consumers bid to buy it. A matching engine settles trades **network-aware**: the buyer pays the ask price **plus the cost of delivering energy over the grid** (line losses + congestion), computed with Dijkstra over the grid graph.

## Stack

- **FastAPI** (async, auto OpenAPI docs at `/docs`)
- **PostgreSQL 16** via SQLAlchemy 2.0
- **JWT auth** (access + refresh tokens, bcrypt hashing)
- **WebSocket** live event stream
- **pytest** test suite (17 tests)

## Quick start

```bash
# 1. Start Postgres (Docker)
docker compose up -d db

# 2. Python env (needs 3.10+)
python3.11 -m venv .venv
./.venv/bin/pip install -r requirements.txt

# 3. Seed demo data (grid, users, devices, orders)
./.venv/bin/python -m scripts.seed

# 4. Run the API
./.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

Interactive API docs: **http://localhost:8000/docs**

### Demo users (password: `password123`)

| Email | Role | Seeded state |
|---|---|---|
| alice@demo.io | prosumer | 2 devices at N4, offer 10 kWh @ 0.12 |
| bob@demo.io | prosumer | 1 device at N5, offer 8 kWh @ 0.10 |
| carol@demo.io | consumer | 1 meter at N6, bid 5 kWh @ 0.30 |
| admin@demo.io | admin | grid administration |

Each user starts with a 500.0 wallet balance.

## Architecture

```
app/
  main.py            FastAPI app, CORS, router mounting
  config.py          Settings from .env
  db.py              Engine / session / Base
  models.py          User, Wallet, LedgerEntry, Device, GridNode,
                     GridEdge, Order, Trade, Telemetry
  schemas.py         Pydantic request/response models
  security.py        bcrypt + JWT helpers
  dependencies.py    get_current_user, require_admin
  services/
    wallet_service.py   Atomic balance mutation + double-entry ledger
    grid_service.py     Graph routing (Dijkstra), loss + congestion cost
    market_service.py   Order placement/reservation, order book, matcher
  routers/
    auth.py          /api/auth/*
    wallets.py       /api/wallet/*
    grid.py          /api/grid/*
    market.py        /api/market/*
    telemetry.py     /api/telemetry, /ws/live
```

### Matching engine economics

- Buyer places a bid at `bid_price`; the **full bid value is reserved** from their wallet immediately.
- When matching runs, each candidate offer gets a *delivered cost* = `ask + network_cost(seller_node → buyer_node)`.
- Offers are matched cheapest-delivered-first. Buyer pays `ask * qty + network_cost * qty`; seller receives `ask * qty`.
- The network cost margin is retained by the platform (congestion revenue). Unmatched bid remainder stays reserved until cancel/expire.

## API reference (base: `http://localhost:8000`)

### Auth
| Method | Path | Body | Auth |
|---|---|---|---|
| POST | `/api/auth/register` | `{email, password, full_name, role?}` | — |
| POST | `/api/auth/login` | form `username` (email) + `password` | — |
| POST | `/api/auth/login-json` | `{email, password}` | — |
| POST | `/api/auth/refresh` | `{refresh_token}` | — |
| GET | `/api/auth/me` | — | Bearer |

All authenticated endpoints: `Authorization: Bearer <access_token>`.

### Wallet
| Method | Path | Notes |
|---|---|---|
| GET | `/api/wallet` | balance, reserved, available |
| GET | `/api/wallet/ledger?limit&offset` | immutable transaction history |
| POST | `/api/wallet/deposit/self` | `{amount}` — hackathon faucet |
| POST | `/api/wallet/deposit` | admin-only variant |

### Grid
| Method | Path | Notes |
|---|---|---|
| GET | `/api/grid/nodes` | list grid nodes (`?region=`) |
| GET | `/api/grid/nodes/{id}` | one node |
| GET | `/api/grid/edges` | edges with live utilization |
| GET | `/api/grid/route?from_node&to_node` | cheapest path + network cost/kWh |
| POST | `/api/grid/devices` | register device `{name, node_id, device_type, capacity_kwh}` |
| GET | `/api/grid/devices` | my devices |

### Market
| Method | Path | Notes |
|---|---|---|
| POST | `/api/market/orders` | `{side: "offer"|"bid", price_per_kwh, quantity_kwh, node_id, expires_in_hours?}` |
| GET | `/api/market/orders?status=` | my orders |
| DELETE | `/api/market/orders/{id}` | cancel (releases reservation) |
| GET | `/api/market/orderbook?node_id` | aggregated price levels |
| GET | `/api/market/trades` | my trades (buyer or seller) |
| POST | `/api/market/match` | run the matching engine now |

### Telemetry / Live
| Method | Path | Notes |
|---|---|---|
| POST | `/api/telemetry` | `{device_id, production_kwh, consumption_kwh, battery_kwh}` |
| GET | `/api/telemetry/device/{device_id}` | device history |
| WS | `/ws/live` | send `{"action":"subscribe","channel":"trades"}` |

## Typical frontend flow

1. `POST /api/auth/register` → store tokens.
2. `POST /api/wallet/deposit/self` → fund test wallet.
3. `GET /api/grid/nodes` → pick your node.
4. `POST /api/grid/devices` → register your device.
5. `GET /api/market/orderbook` → see market.
6. `POST /api/market/orders` → place offer or bid.
7. `POST /api/market/match` (any user can trigger) → settle.
8. `GET /api/market/trades` + `GET /api/wallet/ledger` → show results.
9. Subscribe to `/ws/live` for real-time updates.

## Tests

```bash
docker compose up -d db          # tests need Postgres
./.venv/bin/python -m pytest tests/ -q
```

Tests auto-create a `solarmesh_test` database and roll back each test's transaction.

## Notes for production hardening

- Alembic migrations instead of `create_all` (dependency already pinned).
- Matching engine as a background worker (Redis stream / Celery beat).
- Replace in-process WebSocket bus with Redis pub/sub for multi-worker.
- Restrict CORS, add rate limiting, and token revocation.
