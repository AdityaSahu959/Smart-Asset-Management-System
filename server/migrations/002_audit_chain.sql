-- Migration 002: audit-chain columns and serialized append state.
-- The migration runner backfills existing rows in id order after this DDL.
-- Existing activity/user/timestamp values are preserved; historical integrity before this migration is not proven.
USE asset_management_system;
ALTER TABLE activity_logs
    ADD COLUMN event_sequence BIGINT UNSIGNED NULL UNIQUE,
    ADD COLUMN prev_hash CHAR(64) NULL,
    ADD COLUMN current_hash CHAR(64) NULL,
    ADD COLUMN canonical_payload LONGTEXT NULL;
CREATE TABLE audit_chain_state (
    id TINYINT PRIMARY KEY,
    sequence BIGINT UNSIGNED NOT NULL,
    last_hash CHAR(64) NOT NULL,
    CONSTRAINT ck_single_chain CHECK (id=1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO audit_chain_state (id, sequence, last_hash)
VALUES (1, 0, '0000000000000000000000000000000000000000000000000000000000000000');

