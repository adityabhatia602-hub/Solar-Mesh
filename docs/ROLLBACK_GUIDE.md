# SolarMesh Reliability & Rapid Rollback Guide

## 1. Fast Incident Recovery Architecture

SolarMesh is architected for zero-downtime recovery using immutable deployment artifacts, database connection resilience, and idempotency protection.

```
                  ┌──────────────────────────────────────────────┐
                  │          Production Failure Detected         │
                  └──────────────────────┬───────────────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 ▼                                               ▼
     ┌────────────────────────┐                     ┌────────────────────────┐
     │  Application Code Bug  │                     │ Database Connectivity  │
     └───────────┬────────────┘                     └────────────┬───────────┘
                 │                                               │
        [1-Click Rollback]                              [Automatic 503 Retry]
     Vercel Instant Rollback                         Graceful degradation with
       or Git Quick Revert                             Retry-After: 5s header
```

---

## 2. Fast Rollback Procedures

### Option A: Vercel Instant 1-Click Rollback (< 30 Seconds)
Every commit pushed to GitHub produces an immutable Vercel deployment. If a bad release reaches production:

1. Open the [Vercel Dashboard](https://vercel.com/dashboard) -> Select **SolarMesh Project**.
2. Click **Deployments** in the top navigation.
3. Locate the previous working deployment and click the **`...`** (Options) button.
4. Click **Instant Rollback** (or promote to production).
5. Alternatively, via Vercel CLI:
   ```bash
   vercel rollback <previous-deployment-url-or-id>
   ```
*Traffic immediately shifts to the previous immutable bundle with 0 build latency.*

---

### Option B: Git Emergency Revert (< 60 Seconds)
If you prefer rolling back via Git:

```bash
# 1. Revert the faulty commit cleanly
git revert HEAD --no-edit

# 2. Push to main to trigger automatic continuous deployment
git push origin main
```
*Vercel automatically detects the new commit and rebuilds the verified good state.*

---

## 3. Database Outage & Recovery Playbook

If the PostgreSQL (Neon) cluster experiences an outage, network partition, or connection pool exhaustion:

1. **What Happens to User Requests?**
   - The backend catches `OperationalError` / `InterfaceError` / `DBAPIError`.
   - The server **does NOT** crash with an unhandled 500 or dump stack traces.
   - The request responds with:
     ```http
     HTTP/1.1 503 Service Unavailable
     Retry-After: 5
     X-Error-Code: DATABASE_UNAVAILABLE

     {
       "detail": "Database service is temporarily unavailable. Connection lost or reconnecting. Please retry in a few moments.",
       "error_code": "DATABASE_UNAVAILABLE",
       "retry_after_seconds": 5,
       "request_id": "c23c454c2127"
     }
     ```
   - Automated `DATABASE_OUTAGE` alerts are dispatched immediately to the alert bus and webhook.

2. **Neon Point-in-Time Restore (PITR)**:
   - If data corruption occurs, restore instantly using Neon's point-in-time branch feature:
     ```bash
     neon branches create --from-point-in-time "2026-09-12T18:00:00Z" --name recovery-branch
     ```

---

## 4. Idempotency & Safe User Retries

If a user's connection drops midway through a financial transfer or order placement:
- The user can safely retry without fear of double debiting.
- The client sends an `X-Idempotency-Key: <unique-uuid>`.
- The server checks the idempotency cache:
  - If completed: returns the previous result with `X-Idempotent-Replay: true`.
  - If processing: returns `409 Conflict` ("Request with this idempotency key is already processing").
  - The ledger entry is applied **only once**.
