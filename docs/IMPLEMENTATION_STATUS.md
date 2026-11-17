# Verified implementation status

This log distinguishes code, mocked tests, live tests, and outstanding work. The supplied handover remains historical reference. The original SQL and its backup have not been modified.

## Local baseline
- Repository: C:/Users/User/Downloads/majorproject, main, starting commit b2aed82.
- Existing foundations retained: React 19/Vite, Express 5/CommonJS, mysql2/MariaDB.
- No XAMPP installation was present on this computer. Teammate's database was on another computer.
- Portable MariaDB 11.4.13 was downloaded from the official archive and its SHA-256 checked.
- New isolated instance: loopback port 3308, private data under the chat's work/smart-assets-db directory. No Windows service installed.
- server/.env.local contains newly generated local configuration, is ignored by Git, and overrides the untouched existing server/.env.

## Phase 0 / database bootstrap
User explicitly approved the isolated initialization and reviewed safe SQL bootstrap.
- SQL File (1).safe.sql removes DROP DATABASE and adds mobile/dob required by existing code.
- Original and backup SHA-256 remain E0AAF1F6F93D1007B670664BB138E259773780FF9BA1DD15F6C6D0A6C8C824A3.
- Seven tables and four roles verified live.
- Dedicated app DB account has SELECT/INSERT/UPDATE/DELETE on the project database only.
- A local Super Admin was provisioned with generated private credentials.
- No connection to the teammate's database or unrelated existing database was made.

## Foundation implementation and verification
- Required JWT secret, HS256 issuer/audience checks, one-hour expiry, current active-user/role lookup.
- Public registration always assigns Viewer; login returns allowlisted fields.
- Server-side route permissions; centralized error handling and input validation.
- Transactional structured activity records, authenticated lab creator.
- Retention: maintenance deletion is refused; assets with history and labs with assets cannot be deleted; asset retirement supported.
- Missing maintenance list and lab-detail endpoints added.
- Shared frontend API client, session guard, session-expiry handling, permission-aware editing.
- Frontend baseline: production build passed; lint originally had 11 errors/2 warnings and was corrected.
- 39 automated Node tests passed before adding the lifecycle UI. They use mocked persistence and do not prove a database migration.

## Migration 001 / identity and maintenance
User explicitly approved migration and synthetic local integration fixtures.
- Real private logical dump created and checked nonempty before migration; restore has NOT been tested.
- Seven tables converted from Latin-1 to utf8mb4; original bootstrap SQL is preserved.
- Maintenance reporter/technician foreign keys added intentionally; legacy technician_name retained.
- Maintenance states, assignment, required resolutions, manager verification, priority/type/source constraints added.
- Expiring hashed single-use password reset tokens and session-version revocation added.
- Nodemailer added as the one authentication-specific dependency. SMTP requires configured TLS and is not configured locally.
- User access management protects the last active Super Admin.

## Real foundation integration result
scripts/verify-foundation-local.js passed against the isolated MariaDB instance:
- Login and safe user profile.
- Registration cannot choose privilege; promotion revokes old sessions.
- Viewer mutation rejection and last-admin protection.
- Hindi lab-name round trip.
- Open -> Assigned -> In Progress -> Resolved -> Closed, technician/manager policy, required resolution.
- Repair-history retention and retirement.
- Password recovery token hashing, single use, and old-session rejection, using a TEST mailer.
- Structured activity rows persisted.
Synthetic maintenance fixture has source_type=synthetic and must be excluded from production retrieval/analytics.
At that phase, real SMTP delivery, browser interaction, audit hashes, AI, semantic retrieval, and reliability calculations were not yet verified. The later verification below supersedes this stopping point.

## Commands used so far
Read-only Git/status/file/hash checks; npm ci --ignore-scripts in server/client; node --check; npm test; npm run lint; npm run build.
Opt-in local setup and migration scripts were executed only after their explicit approvals.
No original destructive SQL was executed, credentials printed, commits created, or unrelated databases modified.

## Final local verification / 2026-11-12

### Completed changes

- Migration 002 applied after explicit approval and checked logical backup. Twelve existing events were backfilled in ID order without changing their original actor, activity text or timestamp. New business mutations append to a serialized SHA-256 audit chain in the same transaction.
- Live audit integration passed ten concurrent appends, atomic business/audit rollback, rollback-only tampering detection, and retained-checkpoint verification. No tampering was committed. Historical integrity before the backfill cannot be established.
- Migration 003 applied after explicit approval and checked logical backup. Added optional AI/manual-review metadata and versioned embeddings, without inserting repair history.
- Authenticated Python/FastAPI CPU worker runs pinned classifier and embedding revisions. Missing/failed/low-confidence results produce manual review. Express owns persistence and does not overwrite human priority with model confidence.
- Real worker integration verified outage/recovery, breaker behavior and embedding idempotence. A positive real-eligible retrieval fixture was tested inside a rolled-back transaction. Committed real maintenance and embeddings remained zero; synthetic fixtures cannot enter operational retrieval or reliability metrics.
- Reliability implementation has unit-tested exclusion rules and missing-date behavior. Its ARI rule and calendar-age MTBF proxy are explicitly labelled as unvalidated indicators, not predictive failure analysis.
- Categories, purchase/warranty/custodian UI, maintenance assignment/progression/closure, user access, audit verification and AI/manual-state UI implemented within the existing React application.
- Browser regression exposed conflicting native and React redirects during session invalidation. Replaced that with token-aware expiry events and a single React navigation; the reusable browser workflow then passed.
- Portable startup/shutdown scripts were exercised, including a complete stop/restart with retained database state. Startup checks identity and migration checksums and executes no setup SQL.
- Compatible JavaScript dependency security fixes retained React/Vite/Express foundations; patched SheetJS distribution replaces the vulnerable npm release. Both npm audits report zero known vulnerabilities at the final check. This is not a permanent security guarantee.

### Evidence and commands

| Check | Result |
| --- | --- |
| `npm test` in server | 67 passed; mocked-persistence unit/security tests |
| `.venv/Scripts/python.exe -m pytest tests -q` in ai_service | 24 passed; worker contract tests using injected models |
| Python `pip check` | No broken requirements |
| `npm run lint` in client | Passed after correcting the new browser-test lint exception |
| `npm run build` in client | Passed; large export-related bundle warning remains |
| `npm audit` in client and server | Zero reported vulnerabilities |
| `node scripts/check-local.js` | Correct isolated instance and all three migration checksums |
| Foundation live script | Authentication, RBAC, reset-token semantics with TEST mailer, Unicode, lifecycle and retention passed |
| Audit live script | Concurrent writes, rollback and tamper detection passed |
| AI live script | Real worker, outage/manual fallback, indexing/retrieval eligibility and rollback tests passed |
| `npm run test:e2e` with explicit local fixture opt-in | One browser test, eight workflow groups; zero page errors or unexpected local failures |
| Export inspection | English asset PDF and QR PDF rendered/inspected; Excel workbook inspected |
| Source secret scan / SQL hashes | Private configuration excluded; original and backup hashes unchanged |

Fixture-writing scripts were run with `--approved-local-fixtures --data <private-data-directory>` after the respective approvals. `setup-local.js` and `migrate-local.js` ran only with explicit approval. No original destructive SQL ran. Read-only schema/identity/checkpoint queries used the approved isolated instance. There was no deployment, commit or push.

The final QA pass also found two verification issues: the documented Python test command needed the worker working directory, and ESLint required an explicit exception to avoid attaching a secret-bearing Playwright error as `cause`. Both were corrected. A failed browser run had produced a local password-bearing failure snapshot; its private values were redacted, traces disabled and password inputs cleared before future failure snapshots. Do not distribute arbitrary private test artifacts.

### Synthetic model evaluation

Reports in `evaluation-baseline.json` and `evaluation-v2.json` contain measured model/runtime details and individual cases. Initial baseline: 9/20 labelled descriptions correct when abstentions count incorrect. Revised category descriptions and vague-input handling: 18/20; warm median about 561 ms, p95 593 ms; ten synthetic retrieval queries matched their expected top result. Four ambiguous cases were included separately.

The same development dataset informed those changes. It was not independently held out or human-reviewed, so those numbers must not be presented as institutional validation or real-world accuracy. No real repair history was manufactured to improve results. English-model results do not establish multilingual performance.

### Remaining work and assumptions

- SMTP is not configured. Token semantics were verified with a test mailer; real delivery was not tested.
- No institutional repair dataset or vetted SOP library was supplied. Real-data collection, independent evaluation, acceptance thresholds and SOP integration remain outstanding.
- Checked logical backups exist privately; restoration has not been exercised. DDL failures may leave partial migrations.
- Local loopback operation is verified; production deployment, HTTPS, external checkpoint custody, monitoring and distributed rate limiting are not implemented here.
- AI retries are explicit; there is no durable outbox/worker queue. Retrieval currently scans up to 200 eligible recent vectors.
- Large export bundle and multilingual PDF font support require further work if those are deployment requirements. English exports were checked.
- The new-computer setup/configuration convenience additions were statically checked; existing private configuration was deliberately not overwritten to retest them. Existing local startup/shutdown and the actual bootstrap/migrations were exercised.

Read `README.md` before running commands on another computer. The isolated database under this chat's work directory is local state, not part of the source package. Preserve the existing private data directory. Do not run these migrations blindly against the teammate's older database.

