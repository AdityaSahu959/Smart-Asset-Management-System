# Smart Asset Management System

An academic asset and maintenance application for institutional laboratories. Staff can identify equipment by QR code, record faults, assign technicians, document repairs, and have managers verify completion. The system preserves maintenance history and supports inventory exports. AI provides optional suggestions; people control priorities, repairs, verification, and retirement.

## What runs where

| Component | Technology | Local address |
| --- | --- | --- |
| Browser interface | React 19 / Vite 8 | http://127.0.0.1:5173 |
| Application backend | Node.js / Express 5 / mysql2 | http://127.0.0.1:5000 |
| Database | MariaDB 11.4.13, MySQL-compatible | 127.0.0.1:3308 |
| Optional AI worker | Python / FastAPI / PyTorch CPU | http://127.0.0.1:8000 |

Express owns authentication, authorization, validation, transactions, audit logging and all database writes. Python handles inference only. XAMPP is not required for this isolated portable setup. A MySQL-compatible client library does not mean two databases are running.

## Existing configured computer

From PowerShell in this repository:

```powershell
.\scripts\start-local.ps1
```

Open http://127.0.0.1:5173 . Model readiness can take longer than web startup. To run without starting the worker, use `-SkipAI`; the application supports manual triage. This switch does not stop an already running worker.

The startup script uses ignored `scripts/local.config.json`, verifies the database directory, port, and all reviewed migration checksums, and starts hidden local processes. It never initializes a database or applies SQL automatically. Logs are under the private database directory's `logs` folder.

To stop only this configured project's processes and gracefully stop its database:

```powershell
.\scripts\stop-local.ps1
```

Local Super Admin email is `admin@smartassets.local`. Open the private credential file locally; do not paste its contents into chat or commit it:

```powershell
$localSetup = Get-Content .\scripts\local.config.json -Raw | ConvertFrom-Json
notepad (Join-Path $localSetup.dataDir 'local-credentials.json')
```

Use only `adminEmail` and `adminPassword` to sign in. That file also contains database credentials. The private runtime/data/model-cache directories are outside the repository. Preserve them when moving or backing up this computer; the source archive deliberately excludes them.

## Using the application

1. Sign in as the local administrator. Create a lab, a category, and an asset with purchase/warranty details if known.
2. New registrations receive Viewer access. A Super Admin can activate/deactivate accounts and assign roles in User Access. Role changes invalidate old sessions.
3. Administrators and technicians can report a fault. Keep the synthetic/test checkbox enabled for demonstrations and evaluation fixtures.
4. A manager assigns an active Technician. That technician progresses the ticket and supplies a resolution. A manager verifies and closes it.
5. Asset history, QR labels, PDF and Excel exports support inventory work. Retire assets to preserve repair history.
6. Audit shows recorded mutations and verifies the hash chain. Export a checkpoint and keep a trusted copy outside the database.

| Role | Main permissions |
| --- | --- |
| Viewer | Read inventory and maintenance history |
| Technician | Report faults; progress and resolve own assigned tickets |
| Admin | Manage inventory/categories; assign, verify and close repairs; view audit |
| Super Admin | Admin permissions plus user access management |

The backend enforces permissions independently of hidden UI controls. The last active Super Admin cannot be disabled or demoted.

## Implemented and checked

- Strong required JWT secret; signed, expiring sessions with current database role/active-state checks; bcrypt passwords; no public privilege selection.
- Expiring, hashed, single-use reset tokens with session revocation. Real email delivery requires SMTP; the local recovery tests use a test mailer.
- Validated lab/asset/category management, purchase/warranty/custodian fields, maintenance lifecycle and retention, Unicode database round trips.
- Transactional audit hash chain, checkpoint verification, concurrent appends and rollback-only tamper detection.
- Optional authenticated AI worker, timeout/circuit breaker, manual fallback, triage metadata and versioned normalized embeddings.
- Retrieval from eligible real, human-verified Closed repairs only; stale, synthetic, unverified and reopened cases are excluded. No fabricated historical matches or SOPs.
- Rule-based reliability indicator and explicitly labelled calendar-age-per-failure proxy.
- Browser workflow covering permissions, role-change session invalidation, asset forms, technician resolution, manager closure, audit and downloads.

See `docs/IMPLEMENTATION_STATUS.md` for evidence and limitations and `docs/SCHEMA_API_MAP.md` for contracts. Historical handover observations are not proof of the current schema.

## AI evidence and limits

Pinned CPU models:

- `valhalla/distilbart-mnli-12-3` at `ef9a58ce6a9cd44cd0d4c2f7db1cd67f81019a8b`.
- `sentence-transformers/all-MiniLM-L6-v2` at `1110a243fdf4706b3f48f1d95db1a4f5529b4d41`, 384 dimensions.

The development evaluation contains 20 labelled and four ambiguous synthetic English descriptions. After revising category descriptions and abstention handling, 18/20 labelled cases were correct with abstentions counted incorrect; ten synthetic retrieval queries found their expected top result. Warm HTTP median was about 561 ms and p95 593 ms on this computer. Baseline and revised reports are in `docs/evaluation-baseline.json` and `docs/evaluation-v2.json`.

The same development set informed those revisions. These are not independent test results, human-reviewed institutional validation, or evidence of multilingual accuracy. Actual first model download/load took about 55 seconds; a later cached evaluation load took about 2.3 seconds. AI confidence does not overwrite human priority. Safety-keyword handling is a conservative policy, not a diagnosis.

No vetted SOP collection was supplied. Missing historical results or unavailable models lead to manual review. Retrieval currently examines up to 200 recent eligible embeddings. Retry is available, but there is no durable background job queue. Real repair data and independent evaluation are outstanding.

## Reliability and audit meaning

ARI uses age penalty capped at 35 over 1,825 days plus decayed priority-weighted failures in a 180-day window; priority weights are 15/10/5/2, decay is exp(-0.02 * days), and the result is clamped to 0..100. Only real, verified Closed Failure tickets with a resolution count. A score below 40 suggests human replacement review; it does not retire equipment. Missing or invalid dates can make the score unavailable. The displayed MTBF proxy is calendar age divided by verified failures, not measured uptime.

The audit chain detects inconsistent changes against retained chain state and trusted checkpoints. A privileged attacker who can rewrite the entire database and replace all checkpoints can defeat a database-only chain. It is tamper-evident, not immutable or externally notarized. Backfilled historical events preserve original values but cannot prove integrity before the backfill. Business mutations and audit append commit together. Login/read events are not comprehensively logged.

## Verification commands

Read-only checks and unit tests:

```powershell
node .\scripts\check-local.js
node .\scripts\check-source-secrets.js
Push-Location server
npm test
npm audit
Pop-Location
Push-Location client
npm run lint
npm run build
npm audit
Pop-Location
Push-Location ai_service
.\.venv\Scripts\python.exe -m pytest tests -q
.\.venv\Scripts\python.exe -m pip check
Pop-Location
```

The integration scripts under `server/scripts/verify-*-local.js` require explicit fixture opt-in and write labelled synthetic records. Read them before rerunning; they are not read-only health checks. The browser test also creates labelled local fixtures, uses installed Chrome, and reads credentials privately:

```powershell
$localSetup = Get-Content .\scripts\local.config.json -Raw | ConvertFrom-Json
$env:ALLOW_LOCAL_FIXTURES = '1'
$env:LOCAL_DATA_DIR = $localSetup.dataDir
Push-Location client
npm run test:e2e
Pop-Location
Remove-Item Env:ALLOW_LOCAL_FIXTURES,Env:LOCAL_DATA_DIR
```

Keep test artifacts private. Browser tests disable traces and clear password inputs on failure. A process-local public-auth rate limiter may reject repeated tests until its window expires; this is not a production distributed rate limiter.

## Fresh computer: review before provisioning

Do not rerun setup on the already configured computer. Source archives contain no database, secrets, installed dependencies, model weights or Python virtual environment. Requirements: compatible Node/npm, Python 3.13, installed Chrome for browser QA, and the official portable MariaDB Windows runtime. The verified runtime here was 11.4.13, ZIP SHA-256 `d62986d433eeebfde218560b276103831604a61e929e87f1a17f5aebbd80257e2`.

Install JavaScript dependencies with `npm ci` in `server` and `client`. Create `ai_service/.venv` and install `ai_service/requirements.lock.txt` (or requirements-dev.txt for tests). CPU PyTorch uses its official extra index; model downloads require network access on first run. The checked-in environment examples contain no usable secrets.

Read the complete safe bootstrap and migrations, check the intended port and database state, and obtain approval before executing any SQL. `server/scripts/setup-local.js --approved --runtime <absolute-runtime-dir> --data <new-absolute-data-dir>` creates a NEW isolated instance on port 3308, refuses existing data/configuration, and provisions restricted app and local administrator accounts. Its reviewed bootstrap checksum is pinned in code. Never execute the original `SQL File (1).sql` or backup as an installation shortcut: they contain destructive historical SQL.

After approved bootstrap, use `server/scripts/migrate-local.js` with `--file`, `--sha256`, `--runtime`, `--data`, and `--approved`, in order:

| File under server/migrations | Reviewed SHA-256 |
| --- | --- |
| 001_identity_and_maintenance.sql | db3d52902fa9f7d2d87f5a02e1b3699bbff55dc625f0aed8f0f2948c44543837 |
| 002_audit_chain.sql | 119ce958fbc03f17d90a30b769f966666e5da4f6793d0043ba73aa2428917792 |
| 003_ai_metadata_and_embeddings.sql | 4ba6e8a1e9226511fb42bb5005617744f49e0164b5d9a69186412bb5bc3b1f7c |

The runner checks the exact isolated instance and a nonempty private logical backup before DDL. DDL is not fully transactional: an error can leave a partial migration. Preserve and inspect that state; do not drop/recreate it. Backup restore has not been tested. These migrations target the inspected safe-bootstrap schema; a teammate's older schema must be reconciled separately.

For optional AI, after local setup run `node server/scripts/configure-ai-local.js` to generate a shared strong key in ignored local configuration. It refuses existing AI configuration. The initial setup/migrations were exercised here; this new-computer convenience configuration path was statically checked, not exercised over existing files.

SMTP is intentionally unconfigured. Configure the ignored server environment using `.env.example`, verified TLS SMTP credentials and an appropriate HTTPS public application URL before testing real recovery delivery. Do not add insecure JWT/AI fallback keys.

## Remaining work before institutional deployment

- Collect real, consented repair cases and vetted SOPs; conduct independent human-reviewed AI/retrieval evaluation and tune thresholds on separate data.
- Configure and verify real SMTP delivery; test backup restoration in a separate approved isolated environment.
- Choose hosting, HTTPS, managed secrets, external checkpoint custody, monitoring, a durable AI queue and shared rate limiting for multiple API processes.
- Review pagination/scale and split the large export-related frontend bundle. Current build passes with a chunk-size warning.
- English PDF/QR/Excel exports were checked. Unicode database support does not establish multilingual PDF font support.

No deployment, Git commit or push was performed as part of the local implementation. Preserve the original SQL and backup. Never modify unrelated `taskflow_db`, `test`, or `testdb` databases.
