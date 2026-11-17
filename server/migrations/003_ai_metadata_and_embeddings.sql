-- Migration 003: optional AI metadata and versioned resolution embeddings.
-- No sample history is inserted. Existing tickets default to manual review.
USE asset_management_system;
ALTER TABLE maintenance
    ADD COLUMN predicted_category VARCHAR(100) NULL,
    ADD COLUMN ai_confidence DOUBLE NULL,
    ADD COLUMN ai_priority_suggestion VARCHAR(16) NULL,
    ADD COLUMN manual_triage_flag BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN safety_escalation_flag BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN ai_model_version VARCHAR(200) NULL,
    ADD COLUMN ai_taxonomy_version VARCHAR(100) NULL,
    ADD COLUMN ai_triaged_at DATETIME NULL,
    ADD COLUMN ai_status VARCHAR(16) NOT NULL DEFAULT 'pending',
    ADD COLUMN resolution_index_status VARCHAR(16) NOT NULL DEFAULT 'ineligible',
    ADD CONSTRAINT ck_ai_confidence CHECK (ai_confidence IS NULL OR (ai_confidence>=0 AND ai_confidence<=1)),
    ADD CONSTRAINT ck_ai_status CHECK (ai_status IN ('pending','completed','failed')),
    ADD CONSTRAINT ck_resolution_index CHECK (resolution_index_status IN ('ineligible','pending','indexed','failed'));

CREATE TABLE maintenance_embeddings (
    ticket_id INT PRIMARY KEY,
    model_version VARCHAR(200) NOT NULL,
    dimensions SMALLINT NOT NULL,
    vector_json LONGTEXT NOT NULL,
    text_fingerprint CHAR(64) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES maintenance(id),
    CONSTRAINT ck_embedding_dimensions CHECK (dimensions=384),
    CONSTRAINT ck_embedding_json CHECK (JSON_VALID(vector_json))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

