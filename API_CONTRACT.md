# SolarMesh API Contract

Base URL (local dev): `http://localhost:8000` · Swagger docs: `http://localhost:8000/docs`

All authenticated endpoints expect `Authorization: Bearer <access_token>`.
Timestamps are ISO-8601 UTC. Energy quantities are kWh; instantaneous power is kW.

**Data honesty:** telemetry, devices, grid loads, and topology come from the built-in
**simulated digital twin**. Matching, Dijkstra routing, loss math, congestion,
settlement, and wallets are **real application logic**.

---

## Authentication — `/api/auth`

| Method | Path | Auth | Body | Response | Errors |
|---|---|---|---|---|---|
| POST | `/register` | — | `{email, password, full_name, role}` role: `prosumer\|consumer` | `201 {access_token, refresh_token, token_type}` | `409` email taken |
| POST | `/login` | — | OAuth2 form (`username`, `password`) | `200 TokenPair` | `401` bad creds |
| POST | `/login-json` | — | `{email, password}` | `200 TokenPair` | `401` bad creds |
| POST | `/refresh` | — | `{refresh_token}` | `200 TokenPair` | `401` invalid |
| GET | `/me` | Bearer | — | `200 {id, email, full_name, role, is_active}` | `401` |

---

## Wallet — `/api/wallet`

| Method | Path | Auth | Response | Notes |
|---|---|---|---|---|
| GET | `/` | Bearer | `{id, user_id, balance, reserved, available, energy_kwh_sold, energy_kwh_bought}` | |
| GET | `/ledger?limit&offset` | Bearer | `[{id, entry_type, amount, balance_after, reference, memo, created_at}]` | entry_type: `deposit\|trade_payment\|trade_receipt\|network_fee\|withdrawal\|adjustment` |
| POST | `/deposit/self` | Bearer | `{amount}` (gt 0) → Wallet | Faucet: credit own wallet |
| POST | `/deposit?user_id=` | **Admin** | `{amount}` → Wallet | Credit another user |

Errors: `403` non-admin faucet for others, `422` validation.

---

## Grid & Devices — `/api/grid`

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/nodes` | — | `[{id, code, name, node_type, region, congestion_level}]` |
| GET | `/nodes/{id}` | — | `GridNodeOut` · `404` |
| GET | `/edges` | — | `[{id, from_node_id, to_node_id, capacity_kw, load_kw, loss_factor, utilization, status, is_active}]` — status: `normal\|congested\|offline` |
| GET | `/route?from_node&to_node&required_kw` | — | `{feasible, path_node_ids, path_loss, congestion_penalty, total_network_cost_per_kwh, min_available_capacity_kw, loss_factor, rejected_reason}` |
| GET | `/devices` | Bearer | own devices `[{id, owner_id, node_id, name, device_type, capacity_kwh, status, is_active}]` |
| POST | `/devices` | Bearer | `{name, node_id, device_type, capacity_kwh}` → `201 DeviceOut` · `404` node |

---

## Market — `/api/market`

| Method | Path | Auth | Body / Params | Response | Errors |
|---|---|---|---|---|---|
| POST | `/orders` | Bearer | `{side: offer\|bid, price_per_kwh>0, quantity_kwh>0, node_id, device_id?, expires_in_hours?}` | `201 OrderOut` | `400` node/device invalid, insufficient balance, offer exceeds capacity |
| GET | `/orders?status=` | Bearer | — | own orders `[OrderOut]` | |
| GET | `/orders/open?side&node_id&limit` | — | — | **all users'** open orders `[OrderOut]` | |
| DELETE | `/orders/{id}` | Bearer | — | `200 OrderOut` (cancelled) | `400`/`404` |
| GET | `/orderbook?node_id` | — | — | `{bids[], offers[], spread, midpoint}` | |
| POST | `/match` | Bearer | — | `{matched_trades, total_volume_kwh, total_value, total_loss_kwh, trades[]}` | |
| GET | `/trades?limit` | Bearer | — | own trades `[TradeOut]` | |

`OrderOut`: `{id, side, user_id, node_id, price_per_kwh, quantity_kwh, filled_kwh, remaining_kwh, status, created_at}`

### TradeOut (also used in WebSocket `trade` events)

```json
{
  "id": "…", "offer_id": "…", "bid_id": "…", "seller_id": "…", "buyer_id": "…",
  "quantity_kwh": 5.26,        // energy sent by seller (gross)
  "delivered_kwh": 5.0,        // energy received by buyer (net of losses)
  "energy_loss_kwh": 0.26,
  "loss_percentage": 4.94,
  "price_per_kwh": 0.12,       // seller ask
  "network_cost_per_kwh": 0.03,
  "total_amount": 0.787,       // buyer pays = qty*price + qty*network_cost
  "path_nodes": ["N4", "N2", "N6"],
  "explanation": {
    "price_check": true, "seller_has_energy": true,
    "route_exists": true, "capacity_ok": true,
    "loss_factor": 0.0494,
    "energy_sent_kwh": 5.26, "energy_delivered_kwh": 5.0, "energy_loss_kwh": 0.26,
    "network_cost_total": 0.158, "buyer_total": 0.787,
    "reason": "Buyer bid $0.30/kWh covered the seller ask $0.12/kWh plus $0.0300/kWh network delivery over 2 hop(s); the path had sufficient spare capacity."
  },
  "status": "settled", "created_at": "…"
}
```

---

## Trades — `/api/trades`

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/?limit` | Bearer | trades the user participates in (admin: all) |
| GET | `/all?limit` | **Admin** | every trade |
| GET | `/{trade_id}` | Bearer | single trade · `404` unknown · `403` not a party |

---

## Telemetry — `/api/telemetry`

| Method | Path | Auth | Body / Params | Response |
|---|---|---|---|---|
| POST | `/` | Bearer | `{device_id, production_kw, consumption_kw, battery_soc 0-100, battery_kw, voltage, current, power_kw}` | `201 TelemetryOut` · `403` not your device |
| GET | `/latest?device_id&limit` | Bearer | — | latest reading per device `[TelemetryOut]` |
| GET | `/device/{device_id}?limit` | Bearer | — | history (own device or admin) |

`TelemetryOut`: `{id, device_id, node_id, production_kw, consumption_kw, battery_soc, battery_kw, voltage, current, power_kw, recorded_at}`

Ingesting a reading with net export > 0.1 kW auto-creates/refreshes a SELL order; net import > 0.1 kW creates a BUY order (one active order per user+node+side).

---

## Simulation — `/api/simulation`

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| GET | `/status` | — | — | `{is_running, interval_seconds, tick_count, last_tick_at, started_at, loop_alive}` |
| POST | `/start` | **Admin** | — | SimulationStatusOut · `403` non-admin |
| POST | `/stop` | **Admin** | — | SimulationStatusOut |
| POST | `/tick` | Bearer | `{ticks: 1-20}` | `{ticks_run, total_trades, total_volume_kwh, last}` |

One global loop; ticks run telemetry → auto orders → matching → settlement → WebSocket broadcast.

---

## Analytics — `/api/analytics` (Bearer)

| Path | Response (key fields) |
|---|---|
| `/dashboard?hours=24` | `{total_generation_kwh, total_consumption_kwh, total_energy_traded_kwh, total_energy_delivered_kwh, total_energy_lost_kwh, average_trade_price, trade_count, active_offers, active_bids, congestion_events, total_network_fees, timeseries:[{time, generation, consumption}]}` |
| `/grid` | `{total_load_kw, total_capacity_kw, highest_load_edge, congested_edges[], average_loss_factor, congestion_events[]}` |
| `/market` | `{buy_volume_kwh, sell_volume_kwh, matched_volume_kwh, average_price, average_loss_kwh, total_network_fees, trade_count}` |

---

## WebSocket — `ws://localhost:8000/ws/live?token=<access_token>`

Subscribe: `{"action": "subscribe", "channel": "trades"}` → `{"ok": true, "subscribed": "trades"}`

Channels: `trades` · `orders` · `telemetry` · `grid` · `simulation` · `user:<id>` · `node:<id>`

| Event `type` | Channel | `data` |
|---|---|---|
| `telemetry` | telemetry, node:* | TelemetryOut |
| `grid_update` | grid | `{node_id}` |
| `order_created` / `order_cancelled` | orders | OrderOut |
| `trade` | trades, user:* | TradeOut |
| `trade_settled` | grid | TradeOut |
| `simulation_status` | simulation | `{is_running}` |

---

## Conventions

- Errors: FastAPI standard `{"detail": "…"}` with `400/401/403/404/409/422/500`.
- Roles: `admin` > `prosumer` (sell + buy) / `consumer` (buy). Device ownership enforced.
- Bids escrow funds on placement; settlement is atomic (trade + debits + credits + ledger rows).
- See `solarmesh-backend/tests/e2e_demo.py` for a living example of the whole flow.
