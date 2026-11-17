import os
import time
import secrets
from contextlib import asynccontextmanager
from fastapi import FastAPI, Header, HTTPException, Depends, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from .config import TRIAGE_VERSION, EMBEDDING_VERSION, TAXONOMY_VERSION, DIMENSIONS
from .models import ModelManager, fingerprint
from .schemas import TriageRequest, ResolutionRequest, RecommendRequest
from .retrieval import rank

def create_app(manager=None, key=None):
    key = key if key is not None else os.environ.get("AI_SERVICE_KEY")
    if not isinstance(key, str) or len(key.encode()) < 32:
        raise RuntimeError("AI_SERVICE_KEY must contain at least 32 bytes; no fallback is permitted")
    manager = manager if manager is not None else ModelManager()

    @asynccontextmanager
    async def lifespan(app):
        try:
            await run_in_threadpool(manager.load)
        except Exception:
            manager.ready = False
        yield
        manager.ready = False

    app = FastAPI(title="Smart Assets inference worker", lifespan=lifespan, docs_url=None, redoc_url=None)
    app.state.manager = manager

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, error):
        return JSONResponse(status_code=422, content={"detail": [{"loc": list(item["loc"]), "msg": item["msg"], "type": item["type"]} for item in error.errors()]})

    @app.middleware("http")
    async def body_limit(request: Request, call_next):
        try:
            size = int(request.headers.get("content-length", "0"))
        except ValueError:
            return JSONResponse(status_code=400, content={"detail": "Invalid body size"})
        if size > 2_000_000:
            return JSONResponse(status_code=413, content={"detail": "Request body too large"})
        return await call_next(request)

    def authorize(x_ai_key: str = Header(default="", alias="X-AI-Key")):
        if not secrets.compare_digest(x_ai_key.encode(), key.encode()):
            raise HTTPException(status_code=401, detail="Internal authentication required")

    def inference(operation):
        if not manager.ready:
            raise HTTPException(status_code=503, detail="AI unavailable; manual triage required")
        if not manager.lock.acquire(blocking=False):
            raise HTTPException(status_code=503, detail="AI busy; manual triage required")
        try:
            return operation()
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=503, detail="AI inference unavailable; manual triage required") from None
        finally:
            manager.lock.release()

    @app.get("/healthz")
    def health():
        status = 200 if manager.ready else 503
        return JSONResponse(status_code=status, content={
            "ready": manager.ready, "triage_model": TRIAGE_VERSION,
            "embedding_model": EMBEDDING_VERSION, "dimensions": DIMENSIONS,
            "load_seconds": manager.load_seconds, "quantization": "none",
        })

    @app.post("/api/v1/triage", dependencies=[Depends(authorize)])
    def triage(body: TriageRequest):
        started = time.perf_counter()
        result = inference(lambda: manager.triage(body.description))
        return {**result, "request_id": body.request_id, "model_version": TRIAGE_VERSION,
                "taxonomy_version": TAXONOMY_VERSION, "duration_ms": (time.perf_counter() - started) * 1000}

    @app.post("/api/v1/index-resolution", dependencies=[Depends(authorize)])
    def index_resolution(body: ResolutionRequest):
        vector = inference(lambda: manager.embed(body.issue_description))
        return {"ticket_id": body.ticket_id, "vector": vector, "dimensions": DIMENSIONS,
                "model_version": EMBEDDING_VERSION,
                "text_fingerprint": fingerprint(body.issue_description, body.resolution_summary)}

    @app.post("/api/v1/recommend", dependencies=[Depends(authorize)])
    def recommend(body: RecommendRequest):
        if not body.historical_tickets:
            return {"matches": [], "fallback": "manual", "message": "No verified historical repairs are available. Technician diagnosis is required."}
        matches = inference(lambda: rank(manager.embed(body.description), body.historical_tickets, body.min_similarity))
        return {"matches": matches, "fallback": None if matches else "manual",
                "message": "Historical suggestions require technician review." if matches else "No verified repair matched. Technician diagnosis is required."}
    return app

