import numpy as np

def rank(query, records, threshold=0.45):
    query = np.asarray(query, dtype=np.float64)
    norm = float(np.linalg.norm(query))
    if norm == 0 or not np.isfinite(query).all():
        raise ValueError("Invalid query embedding")
    query = query / norm
    matches = []
    seen = set()
    for record in records:
        if record.ticket_id in seen:
            continue
        seen.add(record.ticket_id)
        vector = np.asarray(record.vector, dtype=np.float64)
        score = float(np.dot(query, vector) / np.linalg.norm(vector))
        score = max(-1.0, min(1.0, score))
        if score >= threshold:
            matches.append({
                "ticket_id": record.ticket_id, "similarity": score,
                "issue_description": record.issue_description,
                "resolution_summary": record.resolution_summary,
                "model_version": record.model_version, "verified": True,
            })
    return sorted(matches, key=lambda match: (-match["similarity"], match["ticket_id"]))[:3]

