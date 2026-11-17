import os
import time
import hashlib
import threading
from .config import TRIAGE_MODEL, TRIAGE_REVISION, EMBEDDING_MODEL, EMBEDDING_REVISION, CATEGORIES, LABEL_DESCRIPTIONS
from .policy import triage_policy, adequate

class ModelManager:
    def __init__(self):
        self.ready = False
        self.load_seconds = None
        self.lock = threading.BoundedSemaphore(1)

    def load(self):
        cache = os.environ.get("HF_HOME")
        if not cache:
            raise RuntimeError("HF_HOME must be configured for local model storage")
        from transformers import pipeline
        from sentence_transformers import SentenceTransformer
        import torch
        torch.set_num_threads(min(4, os.cpu_count() or 1))
        started = time.perf_counter()
        self.classifier = pipeline(
            "zero-shot-classification", model=TRIAGE_MODEL, revision=TRIAGE_REVISION,
            device=-1, trust_remote_code=False,
        )
        self.encoder = SentenceTransformer(
            EMBEDDING_MODEL, revision=EMBEDDING_REVISION, device="cpu",
            cache_folder=os.path.join(cache, "sentence-transformers"), trust_remote_code=False,
        )
        self.load_seconds = time.perf_counter() - started
        self.ready = True

    def triage(self, description):
        if not adequate(description):
            result = {"labels": [], "scores": []}
        else:
            result = self.classifier(
                description, candidate_labels=LABEL_DESCRIPTIONS,
                hypothesis_template="The reported problem is caused by {}.", multi_label=False,
            )
        labels = [CATEGORIES[LABEL_DESCRIPTIONS.index(label)] for label in result["labels"]]
        return {**triage_policy(description, labels, result["scores"]),
                "candidate_scores": dict(zip(labels, map(float, result["scores"])))}

    def embed(self, text):
        return self.encoder.encode(text, normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False).tolist()

def fingerprint(issue, resolution):
    return hashlib.sha256((issue + "\n" + resolution).encode("utf-8")).hexdigest()

