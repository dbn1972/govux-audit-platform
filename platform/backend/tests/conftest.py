"""Test fixtures. Runs against the Postgres test DB (docker compose service),
with the Redis Streams queue monkeypatched to no-ops so no broker is needed.

    docker compose up -d db
    GOVUX_DATABASE_URL=postgresql+psycopg://govux:govux@localhost:5432/govux \\
      pytest
"""
import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import Base, engine, SessionLocal
from app import models, security
from app.services import queue, cache, url_validate


class FakeRedis:
    """Minimal in-memory stand-in for the Redis client used in tests."""
    def __init__(self):
        self.store: dict[str, str] = {}
        self.exp: dict[str, int] = {}
        self.hashes: dict[str, dict] = {}

    def ping(self):
        return True

    def get(self, k):
        return self.store.get(k)

    def hgetall(self, k):
        return dict(self.hashes.get(k, {}))

    def hset(self, k, mapping=None, **kw):
        h = self.hashes.setdefault(k, {})
        if mapping:
            h.update({str(a): str(b) for a, b in mapping.items()})
        return len(h)

    def set(self, k, v, nx=False, ex=None):
        if nx and k in self.store:
            return None
        self.store[k] = str(v)
        if ex:
            self.exp[k] = ex
        return True

    def setex(self, k, ttl, v):
        self.store[k] = str(v)

    def incr(self, k):
        return self.incrby(k, 1)

    def incrby(self, k, n=1):
        self.store[k] = str(int(self.store.get(k, 0)) + n)
        return int(self.store[k])

    def xlen(self, stream):
        return 0

    def xpending(self, stream, group):
        return {"pending": 0}

    def expire(self, k, ttl):
        self.exp[k] = ttl
        return True

    def ttl(self, k):
        return self.exp.get(k, 60)

    def exists(self, k):
        return 1 if k in self.store else 0

    def delete(self, *keys):
        for k in keys:
            self.store.pop(k, None)
            self.hashes.pop(k, None)

    def scan_iter(self, match=None):
        import fnmatch
        return [k for k in list(self.store) if match is None or fnmatch.fnmatch(k, match)]


@pytest.fixture(scope="session", autouse=True)
def _schema():
    Base.metadata.create_all(engine)
    yield
    # tests run against the shared dev DB with the queue monkeypatched, so any
    # audit they leave in 'queued' would block real audits of the same domain
    # forever (the idempotency guard in POST /v1/audits returns it instead of
    # enqueueing). Cancel them on the way out.
    s = SessionLocal()
    try:
        (s.query(models.Audit)
          .filter(models.Audit.status.in_(["queued", "crawling", "analyzing", "scoring"]))
          .update({models.Audit.status: "cancelled"}, synchronize_session=False))
        s.commit()
    finally:
        s.close()


@pytest.fixture(autouse=True)
def _clean_settings():
    """Runtime config lives in a shared table; wipe overrides so a test that edits
    settings can't leak into another (each test starts from the code defaults)."""
    s = SessionLocal()
    try:
        s.query(models.AppSetting).delete(); s.commit()
    finally:
        s.close()
    yield


@pytest.fixture(autouse=True)
def _no_broker(monkeypatch):
    monkeypatch.setattr(queue, "ensure_group", lambda: None)
    monkeypatch.setattr(queue, "enqueue_audit", lambda *a, **k: "1-0")
    monkeypatch.setattr(queue, "set_status", lambda *a, **k: None)
    monkeypatch.setattr(queue, "read_jobs", lambda *a, **k: [])
    monkeypatch.setattr(queue, "ack", lambda *a, **k: None)
    # public-scan queue (single-concurrency) — no-op the broker calls
    monkeypatch.setattr(queue, "ensure_public_group", lambda: None)
    monkeypatch.setattr(queue, "enqueue_public", lambda *a, **k: "1-0")
    monkeypatch.setattr(queue, "read_public", lambda *a, **k: [])
    monkeypatch.setattr(queue, "ack_public", lambda *a, **k: None)
    # fresh in-memory Redis per test: the shared client used by the pdf cache and by
    # ratelimit / captcha / authguard, so quota + lock-out tests are deterministic
    monkeypatch.setattr(queue, "_r", FakeRedis())
    # point the aggregate cache at a fresh fake too (deterministic /national /rankings)
    monkeypatch.setattr(cache, "_r", FakeRedis())
    # fictitious test domains "resolve" to a public IP (real DNS is stubbed);
    # url-validation tests inject their own resolver to exercise the SSRF path
    # 8.8.8.8 is genuinely public — note Python 3.12 flags the TEST-NET doc ranges
    # (198.51.100/203.0.113) as is_private, which the SSRF guard would reject.
    monkeypatch.setattr(url_validate, "_resolve", lambda host: ["8.8.8.8"])


@pytest.fixture
def db():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def ctx(db):
    """A programme-admin user (superset of roles) with an org, device and token."""
    org = models.Organisation(name="Dept of Posts", org_type="department")
    db.add(org); db.flush()
    u = models.User(email=f"t.{uuid.uuid4().hex[:8]}@nic.in", org_id=org.id,
                    display_name="Tester", role="programme_admin")
    db.add(u); db.flush()
    dev = models.Device(user_id=u.id, device_pubkey="pk")
    db.add(dev); db.commit()
    token = security.issue_access_token(str(u.id), u.role, str(dev.id))
    return {"user": u, "org": org, "device": dev,
            "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture
def verified_domain(db, ctx):
    d = models.Domain(org_id=ctx["org"].id, url=f"test{uuid.uuid4().hex[:6]}.gov.in",
                      tld="gov.in", service_category="transactional", size_class="large",
                      verify_status="verified", created_by=ctx["user"].id)
    db.add(d); db.commit()
    return d
