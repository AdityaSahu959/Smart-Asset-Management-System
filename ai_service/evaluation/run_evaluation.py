import argparse
import json
import platform
import sys
import time
from pathlib import Path
from types import SimpleNamespace
import httpx
import numpy as np
import psutil

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.retrieval import rank
from app.config import CATEGORIES, EMBEDDING_VERSION

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--worker-pid", type=int)
    args = parser.parse_args()
    values = {}
    for line in (ROOT / ".env.local").read_text(encoding="utf-8-sig").splitlines():
        name, separator, value = line.partition("=")
        if separator:
            values[name] = value
    client = httpx.Client(base_url="http://127.0.0.1:8000", headers={"X-AI-Key": values["AI_SERVICE_KEY"]}, timeout=30)
    for attempt in range(60):
        try:
            health = client.get("/healthz")
            if health.status_code == 200:
                break
        except httpx.HTTPError:
            pass
        time.sleep(1)
    else:
        raise RuntimeError("Real worker is not ready")
    data = json.loads((ROOT / "evaluation" / "synthetic_dataset.json").read_text(encoding="utf-8-sig"))
    classifications = []
    for item in data["samples"]:
        started = time.perf_counter()
        response = client.post("/api/v1/triage", json={"description": item["description"], "request_id": item["id"]})
        if response.status_code != 200:
            raise RuntimeError("Real triage request failed with status " + str(response.status_code))
        result = response.json()
        classifications.append({**item, **result, "http_latency_ms": (time.perf_counter() - started) * 1000})
    labelled = [row for row in classifications if row["expected_category"] is not None]
    correct = sum(row["category"] == row["expected_category"] for row in labelled)
    confusion = {label: {predicted: 0 for predicted in CATEGORIES + ["Manual"]} for label in CATEGORIES}
    per_class = {}
    for row in labelled:
        confusion[row["expected_category"]][row["category"] or "Manual"] += 1
    for label in CATEGORIES:
        tp = sum(row["expected_category"] == label and row["category"] == label for row in labelled)
        predicted = sum(row["category"] == label for row in labelled)
        actual = sum(row["expected_category"] == label for row in labelled)
        precision = tp / predicted if predicted else 0
        recall = tp / actual if actual else 0
        per_class[label] = {"precision": precision, "recall": recall, "f1": 2 * precision * recall / (precision + recall) if precision + recall else 0, "support": actual}
    sweep = []
    for threshold in [0.4, 0.5, 0.6, 0.7]:
        accepted = []
        for row in labelled:
            scores = row.get("candidate_scores", {})
            if scores:
                category = max(scores, key=scores.get)
                if scores[category] >= threshold:
                    accepted.append((category, row["expected_category"]))
        sweep.append({"threshold": threshold, "coverage": len(accepted) / len(labelled), "accuracy_among_accepted": sum(actual == predicted for predicted, actual in accepted) / len(accepted) if accepted else None})
    def embed(description, identifier):
        result = client.post("/api/v1/index-resolution", json={
            "ticket_id": identifier, "issue_description": description,
            "resolution_summary": "Synthetic evaluation fixture; never persisted as institutional history",
            "status": "Closed", "verified": True, "source_type": "synthetic",
        })
        if result.status_code != 200:
            raise RuntimeError("Real embedding request failed with status " + str(result.status_code))
        return result.json()["vector"]
    records = []
    for item in data["repairs"]:
        records.append(SimpleNamespace(ticket_id=item["id"], issue_description=item["issue"], resolution_summary=item["resolution"], vector=embed(item["issue"], item["id"]), model_version=EMBEDDING_VERSION))
    retrieval = []
    for index, item in enumerate(data["retrieval_queries"], 100):
        matches = rank(embed(item["description"], index), records, 0.45)
        retrieval.append({**item, "matches": matches, "hit_at_1": bool(matches) and matches[0]["ticket_id"] in item["expected_ids"], "hit_at_3": any(match["ticket_id"] in item["expected_ids"] for match in matches)})
    warm = [row["http_latency_ms"] for row in classifications[1:] if len(row["description"]) >= 15 and len(row["description"].split()) >= 3]
    result = {
        "evaluation_type": "Synthetic prototype evaluation; NOT a human-reviewed institutional validation",
        "human_reviewed": False, "database_rows_inserted": 0,
        "machine": {"python": platform.python_version(), "os": platform.system(), "logical_processors": psutil.cpu_count(), "total_ram_gb": round(psutil.virtual_memory().total / 1024**3, 2)},
        "worker": health.json(),
        "process_rss_mb": round(psutil.Process(args.worker_pid).memory_info().rss / 1024**2, 2) if args.worker_pid else None,
        "classification": {
            "labelled_cases": len(labelled), "ambiguous_cases": len(classifications) - len(labelled),
            "accuracy_with_abstentions_counted_incorrect": correct / len(labelled),
            "manual_review_rate_all_cases": sum(row["manual_triage_required"] for row in classifications) / len(classifications),
            "first_observed_http_latency_ms": classifications[0]["http_latency_ms"],
            "warm_http_median_ms": float(np.median(warm)), "warm_http_p95_ms": float(np.percentile(warm, 95)),
            "per_class": per_class, "confusion_matrix": confusion, "threshold_sweep": sweep,
        },
        "retrieval": {"queries": len(retrieval), "hit_at_1": sum(row["hit_at_1"] for row in retrieval) / len(retrieval), "hit_at_3": sum(row["hit_at_3"] for row in retrieval) / len(retrieval), "cases": retrieval},
        "classification_cases": classifications,
        "limitations": [
            "Small synthetic development fixtures; no institutional or human-reviewed accuracy claim.",
            "English models; storing Unicode does not establish multilingual classification quality.",
            "Confidence scores are not calibrated probabilities; 0.50 and 0.45 remain prototype thresholds.",
            "Priority is an explicit conservative policy; safety keyword false positives require human review.",
            "Historical recommendations are suggestions; no organization-vetted SOP content was supplied.",
            "No INT8 quantization is implemented or claimed.",
        ],
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    summary = {"report": str(output), "classification_accuracy_synthetic": result["classification"]["accuracy_with_abstentions_counted_incorrect"], "warm_median_ms": result["classification"]["warm_http_median_ms"], "warm_p95_ms": result["classification"]["warm_http_p95_ms"], "retrieval_hit_at_1_synthetic": result["retrieval"]["hit_at_1"], "human_reviewed": False}
    print(json.dumps(summary, indent=2))

if __name__ == "__main__":
    main()

