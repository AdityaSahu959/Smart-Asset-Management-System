import re
from .config import CONFIDENCE_THRESHOLD, CATEGORIES

SAFETY = re.compile(r"\b(smoke|sparks?|burning smell|exposed wires?|electric shock|fire)\b", re.I)

VAGUE = re.compile(r"^(?:(?:the|my|this)\s+)?(?:computer|pc|device|system|machine)\s+(?:is\s+)?(?:not working(?: properly| at all)?|broken|faulty|bad)[.!]?$", re.I)

def adequate(text: str) -> bool:
    return len(text.strip()) >= 15 and len(text.split()) >= 3 and not VAGUE.match(text.strip())

def triage_policy(text: str, labels: list[str], scores: list[float]) -> dict:
    safety = bool(SAFETY.search(text))
    score = float(scores[0]) if scores else 0.0
    accepted = adequate(text) and bool(labels) and labels[0] in CATEGORIES and score >= CONFIDENCE_THRESHOLD
    # Severity is a separate explicit policy; classification confidence does not set urgency.
    priority = "Critical" if safety else "Medium"
    return {
        "category": labels[0] if accepted else None,
        "score": score,
        "manual_triage_required": not accepted or safety,
        "priority_suggestion": priority,
        "safety_escalation_required": safety,
    }

