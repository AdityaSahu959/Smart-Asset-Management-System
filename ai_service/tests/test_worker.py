import threading
from types import SimpleNamespace
from fastapi.testclient import TestClient
import pytest
from app.main import create_app
from app.config import CATEGORIES, EMBEDDING_VERSION
from app.policy import triage_policy
from app.retrieval import rank

KEY = "test-only-worker-key-" * 3

class FakeManager:
    ready = False
    load_seconds = 0.01
    def __init__(self):
        self.lock = threading.BoundedSemaphore(1)
        self.embed_calls = 0
    def load(self):
        self.ready = True
    def triage(self, text):
        return {**triage_policy(text, [CATEGORIES[0]], [0.9]), "candidate_scores": {CATEGORIES[0]: 0.9}}
    def embed(self, text):
        self.embed_calls += 1
        return [1.0] + [0.0] * 383

@pytest.fixture
def client():
    with TestClient(create_app(FakeManager(), KEY)) as instance:
        yield instance

def headers():
    return {"X-AI-Key": KEY}

def historical(ticket_id=1, vector=None):
    return {
        "ticket_id": ticket_id, "issue_description": "Synthetic unit-test power failure",
        "resolution_summary": "Synthetic unit-test verified repair", "status": "Closed",
        "verified": True, "source_type": "real", "model_version": EMBEDDING_VERSION,
        "vector": vector or [1.0] + [0.0] * 383,
    }

def test_health_reports_readiness_model_version_and_no_quantization(client):
    result = client.get("/healthz")
    assert result.status_code == 200
    assert result.json()["ready"] is True
    assert result.json()["dimensions"] == 384
    assert result.json()["quantization"] == "none"

def test_worker_requires_internal_authentication(client):
    result = client.post("/api/v1/triage", json={"description": "Computer fails to start", "request_id": "1"})
    assert result.status_code == 401

@pytest.mark.parametrize("description", ["", " " * 10, "x" * 5001, 123])
def test_triage_rejects_invalid_input(client, description):
    result = client.post("/api/v1/triage", headers=headers(), json={"description": description, "request_id": "1"})
    assert result.status_code == 422
    assert "input" not in str(result.json())

def test_unknown_request_fields_are_rejected(client):
    result = client.post("/api/v1/triage", headers=headers(), json={"description": "Computer fails to start", "request_id": "1", "role": "Admin"})
    assert result.status_code == 422

def test_valid_triage_has_model_and_request_metadata(client):
    result = client.post("/api/v1/triage", headers=headers(), json={"description": "Computer fails to start", "request_id": "ticket-42"})
    assert result.status_code == 200
    assert result.json()["request_id"] == "ticket-42"
    assert result.json()["manual_triage_required"] is False

def test_low_confidence_and_short_text_require_human_review():
    assert triage_policy("Computer is not working properly", CATEGORIES, [0.4])["manual_triage_required"]
    assert triage_policy("bad", CATEGORIES, [0.99])["manual_triage_required"]

def test_priority_is_separate_from_model_confidence():
    assert triage_policy("A computer has a broken keyboard", CATEGORIES, [0.99])["priority_suggestion"] == "Medium"
    result = triage_policy("There are sparks and a burning smell", CATEGORIES, [0.99])
    assert result["priority_suggestion"] == "Critical"
    assert result["manual_triage_required"] is True

def test_inference_failure_is_redacted(client):
    client.app.state.manager.triage = lambda text: (_ for _ in ()).throw(RuntimeError("private-secret-error"))
    result = client.post("/api/v1/triage", headers=headers(), json={"description": "Computer fails to start", "request_id": "1"})
    assert result.status_code == 503
    assert "private-secret" not in str(result.json())

def test_busy_worker_returns_manual_fallback(client):
    client.app.state.manager.lock.acquire()
    try:
        result = client.post("/api/v1/triage", headers=headers(), json={"description": "Computer fails to start", "request_id": "1"})
        assert result.status_code == 503
    finally:
        client.app.state.manager.lock.release()

def test_index_returns_normalized_versioned_embedding(client):
    record = historical()
    record.pop("vector")
    record.pop("model_version")
    result = client.post("/api/v1/index-resolution", headers=headers(), json=record)
    assert result.status_code == 200
    assert len(result.json()["vector"]) == 384
    assert len(result.json()["text_fingerprint"]) == 64

@pytest.mark.parametrize("change", [
    {"verified": False}, {"status": "Open"}, {"source_type": "synthetic"},
    {"model_version": "wrong-version"}, {"vector": [0.0] * 384},
    {"vector": [1.0] * 10},
])
def test_retrieval_rejects_unverified_ineligible_or_incompatible_history(client, change):
    result = client.post("/api/v1/recommend", headers=headers(), json={"description": "Computer cannot start", "historical_tickets": [{**historical(), **change}]})
    assert result.status_code == 422

def test_empty_history_has_explicit_manual_fallback_without_embedding(client):
    result = client.post("/api/v1/recommend", headers=headers(), json={"description": "Computer cannot start", "historical_tickets": []})
    assert result.json()["matches"] == []
    assert result.json()["fallback"] == "manual"
    assert client.app.state.manager.embed_calls == 0

def test_retrieval_reuses_stored_vectors_and_returns_top_three(client):
    records = [historical(ticket_id=index) for index in range(1, 6)]
    result = client.post("/api/v1/recommend", headers=headers(), json={"description": "Computer cannot start", "historical_tickets": records})
    assert result.status_code == 200
    assert [match["ticket_id"] for match in result.json()["matches"]] == [1, 2, 3]
    assert client.app.state.manager.embed_calls == 1

def test_poor_matches_have_manual_fallback(client):
    record = historical(vector=[0.0, 1.0] + [0.0] * 382)
    result = client.post("/api/v1/recommend", headers=headers(), json={"description": "Computer cannot start", "historical_tickets": [record]})
    assert result.json()["matches"] == []
    assert result.json()["fallback"] == "manual"

def test_rank_deduplicates_ticket_ids():
    record = SimpleNamespace(**historical())
    assert len(rank([1.0] + [0.0] * 383, [record, record])) == 1

def test_startup_failure_is_not_ready():
    class Broken(FakeManager):
        def load(self):
            raise RuntimeError("private-startup-detail")
    with TestClient(create_app(Broken(), KEY)) as client:
        result = client.get("/healthz")
        assert result.status_code == 503
        assert "private-startup" not in str(result.json())

