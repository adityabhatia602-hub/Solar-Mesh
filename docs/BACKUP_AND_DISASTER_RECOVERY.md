# SolarMesh Backup & Disaster Recovery Runbook

## 1. Executive Summary & Strategy
SolarMesh employs a **Defense-in-Depth, Dual-Tier Backup Strategy** to ensure zero permanent data loss, rapid recovery time, and strict data consistency across all P2P energy trading and financial ledger records.

```
                    ┌─────────────────────────────────────────────────────────┐
                    │               SOLARMESH DATA RECOVERY TIERS             │
                    └─────────────────────────────────────────────────────────┘
                                                 │
                   ┌─────────────────────────────┴─────────────────────────────┐
                   ▼                                                           ▼
       ┌───────────────────────────────┐                       ┌───────────────────────────────┐
       │   TIER 1: CONTINUOUS CLOUD    │                       │    TIER 2: AUTONOMOUS DAILY   │
       │    POINT-IN-TIME (PITR)       │                       │       LOGICAL SNAPSHOTS       │
       ├───────────────────────────────┤                       ├───────────────────────────────┤
       │ Provider: Neon PostgreSQL     │                       │ Engine: SolarMesh Backup CLI  │
       │ Frequency: Continuous WAL     │                       │ Frequency: Daily at 02:00 UTC │
       │ RPO: < 1 minute               │                       │ RPO: 24 hours (disaster safe) │
       │ RTO: < 2 minutes (instant)    │                       │ RTO: < 5 minutes              │
       │ Retention: 7 to 30 days       │                       │ Retention: 30 days (auto-prun)│
       │ Format: WAL stream / branches │                       │ Format: gzip JSON + SHA-256   │
       └───────────────────────────────┘                       └───────────────────────────────┘
```

---

## 2. Backup Schedules & Retention Policy

### A. How Often Do Backups Run?
| Backup Tier | Frequency | Trigger Mechanism | Target Storage |
| :--- | :--- | :--- | :--- |
| **Tier 1: Cloud PITR** | **Continuous** | Real-time Write-Ahead Log (WAL) streaming | Neon Distributed Cloud Storage |
| **Tier 2: Logical Archive** | **Daily at 02:00 UTC** | Automated Cron / CI-CD Runner (`backup_runner.py`) | Compressed Local / S3 / GCS Storage |
| **On-Demand Snapshots** | **Before Migrations** | Admin REST API (`/api/admin/backups/trigger`) | Versioned Backup Vault |

### B. How Long Are Backups Kept Before Deletion?
- **Cloud Continuous PITR**: **7 days rolling window** (standard) / **30 days** (Neon Scale).
- **Logical Snapshots (`.json.gz`)**: **30 days rolling retention**. 
  - Every backup execution automatically triggers `prune_backups(retention_days=30)` to delete archives and manifests that exceed the 30-day cutoff.

---

## 3. Disaster Recovery Objectives

- **RPO (Recovery Point Objective)**:
  - *Cloud Incident / Accidental Data Deletion*: **< 60 seconds** (restore to exact second before corruption via PITR).
  - *Catastrophic Cloud Provider Outage*: **< 24 hours** (restore from cold off-site logical snapshot).
- **RTO (Recovery Time Objective)**:
  - *Neon Instant Branch Restore*: **< 120 seconds** (instant copy-on-write branch).
  - *Logical Full Rehydration*: **< 5 minutes** (schema recreate + topological insertion).

---

## 4. Step-by-Step Restoration Procedures

### Scenario A: Accidental Deletion / Bad Migration (Neon Cloud PITR)
Use this when someone dropped a table or corrupt data was written at a known timestamp (e.g. `2026-09-13T00:15:00Z`):

1. **Identify the exact target timestamp**:
   - Check server logs or `GET /api/monitoring/errors` to determine the minute before the corruption occurred.
2. **Restore via Neon Console**:
   - Log in to [console.neon.tech](https://console.neon.tech).
   - Select the `solarmesh` project -> **Branches** -> **New Branch**.
   - Under *Branch from*, select **Point in time**.
   - Enter the target timestamp (e.g., `2026-09-13 00:14:55 UTC`).
   - Click **Create branch**. (Takes ~5 seconds).
3. **Point Backend to Restored Branch**:
   - Update `DATABASE_URL` in Vercel environment variables or `.env` with the new connection string.
   - Trigger instant deployment: `vercel redeploy`.

### Scenario B: Restoring from SolarMesh Logical Archive (`.json.gz`)
Use this when restoring from an automated daily backup or migrating to a fresh database:

1. **List available backups and verify integrity**:
   ```bash
   python scripts/backup_runner.py --list
   ```
2. **Verify SHA-256 Checksum** (Tamper Detection):
   ```bash
   python scripts/backup_runner.py --verify backups/backup_YYYYMMDD_HHMMSS_xxxxxx.json.gz
   ```
   *The system verifies that the file hash matches `manifest.json` and parses without corruption.*
3. **Execute Safe Transactional Restore**:
   ```bash
   python scripts/backup_runner.py --restore backups/backup_YYYYMMDD_HHMMSS_xxxxxx.json.gz
   ```
   *The restore engine automatically recreates the schema, inserts records in topological foreign-key order, and verifies that final row counts match the manifest exactly.*

### Scenario C: Complete Cloud Outage / Cold Disaster Recovery
If Neon/AWS US-East is down and you need to restore on a completely different PostgreSQL host (e.g., Supabase, RDS, GCP Cloud SQL, or local VM):

1. Provision the new PostgreSQL database instance and retrieve the connection URL.
2. Set the environment variable:
   ```bash
   export DATABASE_URL="postgresql://user:password@new-db-host:5432/solarmesh?sslmode=require"
   ```
3. Run the restore command pointing to your offsite archive:
   ```bash
   python scripts/backup_runner.py --restore backups/backup_latest.json.gz
   ```
4. Start the backend:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```

---

## 5. Automated Backup Setup (Cron & Systemd)

To schedule automated daily backups on your production server, add the following cron entry (`crontab -e`):

```bash
# Run SolarMesh full database backup daily at 02:00 UTC with 30-day retention pruning
0 2 * * * cd /var/www/solarmesh/solarmesh-backend && .venv/bin/python scripts/backup_runner.py --backup --retention-days 30 >> /var/log/solarmesh_backup.log 2>&1
```

---

## 6. Disaster Recovery Verification & Drill History

| Drill Date | Drill Type | Tested By | Target DB | Result | Integrity Status |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **2026-09-13** | **Practical Check: Full Backup & Restore Drill** | Automated CI / Admin | Isolated Test Environment | **PASSED** | 100% row count and FK parity verified. Zero data loss. |
