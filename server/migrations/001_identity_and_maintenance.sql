-- Migration 001: identity recovery and maintenance lifecycle.
-- One-time, additive migration for the inspected project schema.
-- DDL is not transactional: take a logical backup first; stop on any error.
USE asset_management_system;

ALTER DATABASE asset_management_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE roles CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE users CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE labs CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE categories CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE assets CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE maintenance CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE activity_logs CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE users ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE assets ADD COLUMN retired_at DATETIME NULL;

ALTER TABLE maintenance
    MODIFY asset_id INT NOT NULL,
    MODIFY issue_description TEXT NOT NULL,
    MODIFY maintenance_status VARCHAR(100) NOT NULL DEFAULT 'Open',
    ADD COLUMN reporter_id INT NULL,
    ADD COLUMN technician_id INT NULL,
    ADD COLUMN priority VARCHAR(16) NOT NULL DEFAULT 'Medium',
    ADD COLUMN incident_type VARCHAR(16) NOT NULL DEFAULT 'Failure',
    ADD COLUMN source_type VARCHAR(16) NOT NULL DEFAULT 'real',
    ADD COLUMN resolution_summary TEXT NULL,
    ADD COLUMN assigned_at DATETIME NULL,
    ADD COLUMN resolved_at DATETIME NULL,
    ADD COLUMN closed_at DATETIME NULL,
    ADD COLUMN verified_by INT NULL,
    ADD COLUMN verified_at DATETIME NULL,
    ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD CONSTRAINT fk_maintenance_reporter FOREIGN KEY (reporter_id) REFERENCES users(id),
    ADD CONSTRAINT fk_maintenance_technician FOREIGN KEY (technician_id) REFERENCES users(id),
    ADD CONSTRAINT fk_maintenance_verifier FOREIGN KEY (verified_by) REFERENCES users(id),
    ADD CONSTRAINT ck_maintenance_status CHECK (maintenance_status IN ('Open','Assigned','In Progress','Resolved','Closed','Rejected')),
    ADD CONSTRAINT ck_maintenance_priority CHECK (priority IN ('Low','Medium','High','Critical')),
    ADD CONSTRAINT ck_maintenance_source CHECK (source_type IN ('real','synthetic')),
    ADD CONSTRAINT ck_maintenance_incident CHECK (incident_type IN ('Failure','Preventive'));

CREATE TABLE password_reset_tokens (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    consumed_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_reset_user (user_id, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE schema_migrations (
    version VARCHAR(100) PRIMARY KEY,
    checksum CHAR(64) NOT NULL,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

