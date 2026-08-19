"""GovUX Audit Platform API — FastAPI entrypoint.

Run:  uvicorn app.main:app --reload
Docs: http://localhost:8000/docs   (auto-generated OpenAPI)
"""
import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .routers import (auth, audits, domains, rankings, library, monitoring, ci,
                      public, scan_requests, admin_config, studio, assessments, registry,
                      notifications)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s [%(request_id)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S%z",
)
# make request_id always present in the log record (default when not in a request)
_old_factory = logging.getLogRecordFactory()
def _record_factory(*a, **k):
    rec = _old_factory(*a, **k)
    if not hasattr(rec, "request_id"):
        rec.request_id = "-"
    return rec
logging.setLogRecordFactory(_record_factory)
log = logging.getLogger("govux.api")

app = FastAPI(
    title=settings.app_name,
    version="1.1",
    description="Self-service UX & compliance audit engine for .gov.in / .nic.in sites.",
)


@app.on_event("startup")
def _startup_checks():
    # fail fast in production on a missing/duplicate encryption master key
    from .services.secretbox import assert_production_key
    assert_production_key()


@app.middleware("http")
async def _request_id(request: Request, call_next):
    """Attach a request id and baseline security headers to every response.
    (An audit platform that flags others for missing headers must set its own.)"""
    rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    request.state.request_id = rid
    response = await call_next(request)
    response.headers["X-Request-ID"] = rid
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "geolocation=(), camera=(), microphone=()")
    # HSTS only in production (TLS terminated at the ingress) — never over dev http
    if settings.env == "production":
        response.headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
    return response


@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception):
    """Never leak a stack trace to the client. Log it (with the request id) and
    return a friendly, referenceable message so support can trace the incident."""
    rid = getattr(request.state, "request_id", "-")
    log.error("unhandled error on %s %s [%s]: %r", request.method, request.url.path, rid, exc)
    return JSONResponse(status_code=500, headers={"X-Request-ID": rid},
                        content={"detail": "An unexpected error occurred. "
                                 f"Please try again — reference {rid} if it persists.",
                                 "request_id": rid})


app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),  # settings-driven (GOVUX_CORS_ORIGINS)
    allow_credentials=True,                      # needed for the HttpOnly refresh cookie
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(domains.router)
app.include_router(audits.router)
app.include_router(rankings.router)
app.include_router(library.router)
app.include_router(monitoring.router)
app.include_router(ci.router)
app.include_router(public.router)
app.include_router(scan_requests.router)
app.include_router(admin_config.router)
app.include_router(studio.router)
app.include_router(notifications.router)
app.include_router(assessments.router)
app.include_router(registry.router)


@app.get("/healthz", tags=["ops"])
def health():
    """Liveness — the process is up. Cheap, no dependencies."""
    return {"status": "ok", "engine": settings.engine_version}


@app.get("/readyz", tags=["ops"])
def ready():
    """Readiness — the app can actually serve: Postgres and Redis reachable.
    Orchestrators (K8s readiness gate / load balancers) should poll this, not
    /healthz, so traffic only arrives once dependencies are live."""
    from fastapi import Response
    from .database import engine
    from .services import queue
    from sqlalchemy import text as _text
    checks = {}
    try:
        with engine.connect() as conn:
            conn.execute(_text("SELECT 1"))
        checks["db"] = "ok"
    except Exception as exc:  # pragma: no cover - failure path
        checks["db"] = f"error: {str(exc)[:80]}"
    try:
        queue._r.ping()
        checks["redis"] = "ok"
    except Exception as exc:  # pragma: no cover - failure path
        checks["redis"] = f"error: {str(exc)[:80]}"
    ok = all(v == "ok" for v in checks.values())
    return JSONResponse(status_code=200 if ok else 503,
                        content={"status": "ready" if ok else "not_ready", "checks": checks})


@app.get("/metrics", tags=["ops"])
def metrics_endpoint(request: Request):
    """Prometheus scrape target — cache hit-rate, queue depth/lag, DLQ, DB pool.
    Toggle + optional bearer token are admin-configurable at runtime."""
    from fastapi import Response, HTTPException
    from .services import settings_store, metrics
    if not settings_store.get_bool("metrics_enabled", True):
        raise HTTPException(status_code=404)
    token = settings_store.get_str("metrics_token", "")
    # in production a token is mandatory — an open /metrics leaks queue/DB internals (SAST-006)
    if settings.env == "production" and not token:
        raise HTTPException(status_code=401, detail="metrics token required in production")
    if token and request.headers.get("authorization", "") != f"Bearer {token}":
        raise HTTPException(status_code=401, detail="metrics token required")
    return Response(metrics.render_prometheus(),
                    media_type="text/plain; version=0.0.4; charset=utf-8")
