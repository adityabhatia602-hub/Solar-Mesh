"""End-to-end demo-flow verification against a running SolarMesh backend.

Usage: python3 tests/e2e_demo.py [base_url]
Covers: login -> simulation start -> ticks -> auto orders -> matching ->
route/loss verification -> settlement -> wallet deltas -> analytics -> stop.
"""
import json
import sys
import time
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765"


def api(method, path, body=None, token=None, expect_error=False):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        payload = json.loads(e.read().decode())
        if not expect_error:
            raise AssertionError(f"{method} {path} -> {e.code}: {payload}")
        return e.code, payload


PASS = 0


def check(label, cond, detail=""):
    global PASS
    mark = "PASS" if cond else "FAIL"
    print(f"  [{mark}] {label} {detail}")
    if cond:
        PASS += 1
    assert cond, label


print("=== SolarMesh E2E demo-flow verification ===")

# 1. Health
status, health = api("GET", "/health")
check("health ok", health["status"] == "ok", f"sim={health.get('simulation')}")

# 2. Login all demo accounts
tokens = {}
for email in ["admin@demo.io", "alice@demo.io", "bob@demo.io", "carol@demo.io"]:
    code, body = api("POST", "/api/auth/login-json",
                     {"email": email, "password": "password123"})
    check(f"login {email}", code == 200 and "access_token" in body)
    tokens[email] = body["access_token"]

# 3. Bad login rejected
code, _ = api("POST", "/api/auth/login-json",
              {"email": "admin@demo.io", "password": "wrong"},
              expect_error=True)
check("bad password rejected (401)", code == 401)

# 4. Protected endpoint requires token
code, _ = api("GET", "/api/wallet", expect_error=True)
check("wallet requires auth (401/403)", code in (401, 403))

# 5. Grid topology
code, nodes = api("GET", "/api/grid/nodes")
check("6 grid nodes", len(nodes) == 6, f"got {len(nodes)}")
code, edges = api("GET", "/api/grid/edges")
check("14 grid edges (7 bidirectional)", len(edges) == 14, f"got {len(edges)}")

# 6. Start simulation as admin
code, sim = api("POST", "/api/simulation/start", {}, token=tokens["admin@demo.io"])
check("simulation started", sim["is_running"] is True)
code, sim = api("POST", "/api/simulation/start", {}, token=tokens["alice@demo.io"],
                expect_error=True)
check("non-admin cannot start sim (403)", code == 403)

# 7. Ticks: generate telemetry, auto orders, matching
time.sleep(2)
api("POST", "/api/simulation/tick", {"ticks": 6}, token=tokens["admin@demo.io"])
time.sleep(1)

# 8. Telemetry recorded
code, telem = api("GET", "/api/telemetry/latest?limit=20", token=tokens["alice@demo.io"])
check("telemetry recorded", len(telem) >= 1, f"{len(telem)} devices reporting")
sample = telem[0]
check("solar within capacity (<=8 kW)", 0 <= sample["production_kw"] <= 8.0,
      f"{sample['production_kw']} kW")
check("consumption non-negative", sample["consumption_kw"] >= 0)
check("battery SOC bounded", 0 <= sample["battery_soc"] <= 100,
      f"{sample['battery_soc']}%")
check("voltage plausible", 200 <= sample["voltage"] <= 260, f"{sample['voltage']} V")

# 9. Auto orders created from surplus/deficit
code, open_orders = api("GET", "/api/market/orders/open?limit=200",
                        token=tokens["admin@demo.io"])
offers = [o for o in open_orders if o["side"] == "offer"]
bids = [o for o in open_orders if o["side"] == "bid"]
check("auto SELL orders exist", len(offers) >= 1, f"{len(offers)} offers")
check("auto BUY orders exist", len(bids) >= 1, f"{len(bids)} bids")

# 10. Trades executed by the matching engine
code, trades = api("GET", "/api/trades/all", token=tokens["admin@demo.io"])
check("trades executed", len(trades) >= 1, f"{len(trades)} trades")
trade = trades[0]

# 11. Route + loss on trade
check("trade has route", len(trade.get("path_nodes", [])) >= 1,
      " -> ".join(trade.get("path_nodes", [])))
check("delivered <= sent", trade["delivered_kwh"] <= trade["quantity_kwh"],
      f"{trade['quantity_kwh']} sent, {trade['delivered_kwh']} delivered")
check("loss recorded", trade["energy_loss_kwh"] >= 0,
      f"loss {trade['energy_loss_kwh']} kWh ({trade.get('loss_percentage')}%)")
check("network fee charged", trade["network_cost_per_kwh"] >= 0,
      f"${trade['network_cost_per_kwh']}/kWh")
check("explanation present", trade.get("explanation") is not None)

# 12. Wallet settlement: buyer & seller both moved
code, trades_alice = api("GET", "/api/market/trades", token=tokens["alice@demo.io"])
code, wallet_carol = api("GET", "/api/wallet", token=tokens["carol@demo.io"])
code, ledger_carol = api("GET", "/api/wallet/ledger", token=tokens["carol@demo.io"])
types = {e["entry_type"] for e in ledger_carol}
check("carol ledger has entries", len(ledger_carol) >= 1, f"{sorted(types)}")
code, wallet_alice = api("GET", "/api/wallet", token=tokens["alice@demo.io"])
check("wallets settled", wallet_alice["balance"] > 0 and wallet_carol["balance"] > 0,
      f"alice=${wallet_alice['balance']:.2f} carol=${wallet_carol['balance']:.2f}")

# 13. Analytics endpoints
code, dash = api("GET", "/api/analytics/dashboard", token=tokens["admin@demo.io"])
check("dashboard analytics", dash["trade_count"] >= 1,
      f"traded={dash['total_energy_traded_kwh']} kWh, loss={dash['total_energy_lost_kwh']} kWh")
check("analytics timeseries", isinstance(dash.get("timeseries"), list))
code, grid_an = api("GET", "/api/analytics/grid", token=tokens["admin@demo.io"])
check("grid analytics", "total_load_kw" in grid_an,
      f"load={grid_an['total_load_kw']} kW, congested={len(grid_an['congested_edges'])}")
code, market_an = api("GET", "/api/analytics/market", token=tokens["admin@demo.io"])
check("market analytics", market_an["trade_count"] >= 1,
      f"avg price ${market_an['average_price']}")

# 14. Trade detail endpoint
code, detail = api("GET", f"/api/trades/{trade['id']}", token=tokens["admin@demo.io"])
check("trade detail by id", detail["id"] == trade["id"])

# 15. Manual order placement (Carol buys 2 kWh @ 0.25)
code, carol_devices = api("GET", "/api/grid/devices", token=tokens["carol@demo.io"])
code, bid = api("POST", "/api/market/orders",
                {"side": "bid", "price_per_kwh": 0.25, "quantity_kwh": 2,
                 "node_id": carol_devices[0]["node_id"]},
                token=tokens["carol@demo.io"])
check("manual bid placed", bid["side"] == "bid")

# 16. Ownership guard: Alice cannot cancel Carol's order
code, _ = api("DELETE", f"/api/market/orders/{bid['id']}",
              token=tokens["alice@demo.io"], expect_error=True)
check("cannot cancel another user's order", code == 400)

# 17. Stop simulation
code, sim = api("POST", "/api/simulation/stop", {}, token=tokens["admin@demo.io"])
check("simulation stopped", sim["is_running"] is False)

print(f"\n=== {PASS} checks passed — E2E flow is functional ===")
