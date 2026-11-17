# Schema/API contract

## Identity
users: id/full_name/email/password(hash)/mobile/dob/role_id/is_active/token_version.
Registration accepts profile fields and password confirmation. role_id from public requests is ignored; Viewer is resolved by role_name.
JWT contains id/token_version and standard issuer/audience/expiry claims. Role and active status are loaded from the DB.
No password hash is returned. Mobile/DOB are optional profile data and never authorize recovery.
password_reset_tokens stores SHA-256 token hashes, expiry and consumption timestamp. Password reset consumes tokens and increments token_version.

## Labs and assets
labs: lab_name, lab_code, room_number, department, description, extra_details, created_by.
created_by comes from authentication. extra_details is stored JSON; legacy clients use key/value labels.
GET /api/labs returns asset_count; GET /api/labs/:id returns detail.
assets: existing descriptive/specification fields retained; extra_details remains serialized JSON in LONGTEXT.
Allowed condition: New, Good, Fair, Poor, Damaged. Status: Available, In Use, Under Maintenance, Retired.
POST /api/assets/:id/retire preserves history. DELETE fails if maintenance exists.
Categories, purchase/warranty dates and custodian fields are supported in management forms. Category list/create/update routes are under /api/categories; managers may create/update categories.

## Maintenance
Actual names retained: maintenance_status, technician_name, maintenance_date, remarks.
reporter_id is new and is populated from the authenticated user. technician_id references an active user with Technician role.
technician_name remains a historical display label and is populated from that verified account on assignment.
New records must start Open. Managers assign and verify; assigned technicians progress/resolve only their tickets.
Allowed transitions:
- Open -> Assigned or Rejected.
- Assigned -> In Progress or Open.
- In Progress -> Resolved or Assigned.
- Resolved -> Closed or In Progress.
- Closed -> In Progress (manager reopening).
- Rejected -> Open.
Resolution summary required for Resolved/Closed. Closure records verified_by/verified_at. Reopening clears verification.
priority: Low/Medium/High/Critical. incident_type: Failure/Preventive. source_type: real/synthetic.
GET /api/maintenance and GET /api/maintenance/:assetId return ticket histories.
PUT /api/maintenance/:id/assign and PUT /api/maintenance/:id/status enforce lifecycle.
Maintenance deletion is refused. Synthetic data is excluded from operational metrics and retrieval.

## Activity
Current activity_logs stores authenticated actor and structured JSON describing action/entity/entity_id/version.
Business writes and activity insertion share a transaction.
Migration 002 adds event_sequence, prev_hash, current_hash and canonical_payload; audit_chain_state holds the serialized head. Version 1 canonical JSON key order is version, sequence, user_id, activity, created_at. Timestamp is UTC ISO derived from stored epoch; null handling is explicit. Hash = SHA256(previousHash + newline + canonicalJSON), UTF-8, lowercase hexadecimal, with 64 zeroes as genesis. A chain-state lock precedes business mutation and audit insertion in the same transaction.
GET /api/audit lists the latest 100 events; GET /api/audit/verify verifies field consistency, sequence, links, hashes and stored head. Both require manager access. The UI exports a checkpoint; server/scripts/verify-audit-checkpoint.js accepts --checkpoint <trusted-file>. An external trusted checkpoint improves truncation/rewrite detection. It does not make a privileged-database-only system immutable.

## AI metadata and retrieval

Migration 003 adds optional category/confidence/model-version, safety flags, manual-review/reason, processed and indexing fields. maintenance_embeddings is versioned by maintenance/model and stores normalized 384-dimensional vectors with dimensions, model identity and source-text fingerprint. It contains no invented repair history.
GET /api/ai/status reports optional worker availability. POST /api/maintenance/:id/triage retries suggestions for authorized report-capable users. POST /api/maintenance/:id/index is manager-only. GET /api/maintenance/:id/recommendations returns top eligible historical matches or manual fallback. Worker endpoints are private authenticated inference contracts under /api/v1; the worker never writes the database.
Tickets commit before optional triage. Indexing eligibility requires real, Closed, human-verified maintenance with resolution text and is rechecked against the locked record before persistence. Retrieval rejects stale fingerprints, wrong models/dimensions, invalid vectors, synthetic/unverified/reopened records. No SOP corpus exists; no-match results explicitly require manual review. AI confidence is separate from human priority. Timeout and Open/HalfOpen/Closed breaker protect core availability.

## Reliability

GET /api/reliability/:id is authenticated. Only real, verified Closed Failure tickets with a resolution count. ARI uses a 180-day priority-weighted exponentially decayed failure penalty and an age penalty capped at 35; a value below 40 suggests human review. It does not retire assets automatically. MTBF is explicitly a calendar-age-per-verified-failure proxy because actual uptime/downtime is not recorded. Missing/invalid dates produce unavailable metrics and warnings rather than fabricated values. SQL timestamp epochs use UTC sessions; date-only rules/display use configured Asia/Kolkata.

## Roles
All active roles may read labs/assets/history.
Super Admin/Admin manage labs/assets, assign/verify tickets and retire assets.
Technicians may report faults and progress their assigned tickets.
Viewer is read-only. Only Super Admin changes account access.

