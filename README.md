# Smart Asset Management System

An academic asset and maintenance management platform for institutional laboratories. Staff can identify equipment via QR code, report faults, assign technicians, document repairs, and have managers verify completion. The system preserves full maintenance history, supports inventory exports (PDF/Excel), enforces tamper-evident audit logging, and provides optional CPU-based AI triage and historical repair recommendations while keeping humans in control of priorities, repairs, verification, and retirement.

---

## Architecture Overview

| Component | Technology | Local Address |
| :--- | :--- | :--- |
| **Browser Interface** | React 19 / Vite 8 | `http://127.0.0.1:5173` |
| **Application Backend** | Node.js / Express 5 / `mysql2` | `http://127.0.0.1:5000` |
| **Database** | MariaDB 11.4.13 (MySQL-compatible) | `127.0.0.1:3308` |
| **Optional AI Worker** | Python / FastAPI / PyTorch (CPU) | `http://127.0.0.1:8000` |

* **Express** owns authentication, authorization, validation, database transactions, audit logging, and all writes.
* **Python / FastAPI** handles stateless NLP inference and embedding generation only.

---

## Quick Start (Configured Machine)

Start all local services (database, backend, frontend, and AI worker) from PowerShell in the repository root:

```powershell
.\scripts\start-local.ps1
```

Open **`http://127.0.0.1:5173`**. Initial AI model readiness can take slightly longer than web startup; if the worker is still loading or skipped (`.\scripts\start-local.ps1 -SkipAI`), the application seamlessly falls back to manual triage.

To stop only this project's processes and gracefully shut down its database:

```powershell
.\scripts\stop-local.ps1
```

### Local Administrator Credentials
The default local Super Admin email is `admin@smartassets.local`. View your local private credentials without committing them:

```powershell
$localSetup = Get-Content .\scripts\local.config.json -Raw | ConvertFrom-Json
notepad (Join-Path $localSetup.dataDir 'local-credentials.json')
```

---

## Roles & Core Workflows

### Role-Based Access Control (RBAC)
Backend middleware enforces permissions independently of UI controls, and role changes immediately invalidate active sessions. The last active Super Admin cannot be disabled or demoted.

| Role | Permissions |
| :--- | :--- |
| **Viewer** | Read inventory, asset details, and maintenance history (default for new registrations) |
| **Technician** | Report faults; progress and resolve assigned maintenance tickets |
| **Admin** | Manage labs, categories, and assets; assign, verify, and close repairs; view audit logs |
| **Super Admin** | Full Admin permissions plus user activation, deactivation, and role assignment |

### End-to-End Lifecycle
1. **Inventory & QR Labels:** Admins create labs, categories, and assets with purchase/warranty details and generate printable QR labels. Retiring an asset preserves its historical repair record.
2. **Fault Reporting & AI Triage:** Technicians or Admins log faults. When enabled, the AI worker suggests a fault category and priority while preserving human override.
3. **Assignment & Verification:** An Admin assigns an active Technician, who progresses the ticket and logs a resolution summary. An Admin verifies and closes the ticket.
4. **Exports & Auditing:** Export inventory reports to PDF or Excel, and inspect or export checkpoints from the cryptographic audit log.

---

## Security, AI & Reliability Design

* **Authentication & Sessions:** Strong required JWT secret, expiring signed tokens checked against live database role/active status, `bcrypt` password hashing, and single-use expiring password reset tokens.
* **Tamper-Evident Audit Chain:** Business mutations and SHA-256 hash-chain appends commit inside the same database transaction, supporting checkpoint exports and rollback tamper detection.
* **Pinned CPU Models & Guardrails:**
  * **Zero-Shot Triage:** `valhalla/distilbart-mnli-12-3` (`ef9a58ce6a9cd44cd0d4c2f7db1cd67f81019a8b`) across 5 IT/lab fault categories with confidence abstention and conservative safety-keyword escalation.
  * **Historical Repair Retrieval:** `sentence-transformers/all-MiniLM-L6-v2` (`1110a243fdf4706b3f48f1d95db1a4f5529b4d41`, 384 dimensions) indexing only verified, closed, real repairs.
  * **Resilience:** Authenticated loopback communication (`X-AI-Key`), request timeouts, and an automatic circuit breaker that degrades gracefully to manual review.
* **Asset Reliability Indicator (ARI):** Deterministic health score (`0–100`) combining an age penalty (capped at 35 over 1,825 days) and time-decayed, priority-weighted verified failure incidents over a 180-day window ($\exp(-0.02 \times \text{days})$), alongside a calendar-age-per-failure MTBF proxy.

*(See `docs/IMPLEMENTATION_STATUS.md` and `docs/SCHEMA_API_MAP.md` for detailed evaluation benchmarks, schema contracts, and deployment considerations.)*

---

## Verification & Automated Tests

Run read-only security checks and unit/build tests across all three services:

```powershell
# Repository & secret hygiene checks
node .\scripts\check-local.js
node .\scripts\check-source-secrets.js

# Backend tests
Push-Location server; npm test; Pop-Location

# Frontend lint & production build
Push-Location client; npm run lint; npm run build; Pop-Location

# AI worker unit tests
Push-Location ai_service; .\.venv\Scripts\python.exe -m pytest tests -q; Pop-Location
```

### End-to-End Browser QA
Integration scripts under `server/scripts/verify-*-local.js` and Playwright E2E tests require explicit local fixture opt-in:

```powershell
$localSetup = Get-Content .\scripts\local.config.json -Raw | ConvertFrom-Json
$env:ALLOW_LOCAL_FIXTURES = '1'
$env:LOCAL_DATA_DIR = $localSetup.dataDir
Push-Location client; npm run test:e2e; Pop-Location
Remove-Item Env:ALLOW_LOCAL_FIXTURES, Env:LOCAL_DATA_DIR
```

---

## Fresh Machine Provisioning

Source archives deliberately exclude databases, secrets, installed dependencies, model weights, and virtual environments.

1. **Prerequisites:** Node.js/npm, Python 3.13, Google Chrome (for E2E tests), and the portable MariaDB 11.4.13 Windows runtime.
2. **Install Dependencies:** Run `npm ci` in both `server/` and `client/`. Create `ai_service/.venv` and install `ai_service/requirements.lock.txt`.
3. **Bootstrap & Migrate Database:**
   ```powershell
   node server/scripts/setup-local.js --approved --runtime <absolute-runtime-dir> --data <new-absolute-data-dir>
   ```
   Apply migrations in order using `server/scripts/migrate-local.js` (`001_identity_and_maintenance.sql`, `002_audit_chain.sql`, `003_ai_metadata_and_embeddings.sql`) with their reviewed SHA-256 checksums.
4. **Configure Local AI Keys:**
   ```powershell
   node server/scripts/configure-ai-local.js
   ```