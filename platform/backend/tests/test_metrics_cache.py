"""Phase-1 scalability: Prometheus /metrics, admin summary, cache instrumentation
+ stampede single-flight, and read-through caching of hot endpoints."""
from app import models
from app.services import cache, metrics, settings_store


def test_metrics_endpoint_open(client):
    r = client.get("/metrics")
    assert r.status_code == 200
    body = r.text
    assert "govux_cache_hits_total" in body
    assert "govux_queue_audit_depth" in body
    assert r.headers["content-type"].startswith("text/plain")


def test_metrics_endpoint_can_be_disabled(client, db):
    db.add(models.AppSetting(key="metrics_enabled", value="false")); db.commit()
    assert client.get("/metrics").status_code == 404


def test_metrics_endpoint_token_gate(client, db):
    db.add(models.AppSetting(key="metrics_token", value=__import__("app.services.secretbox",
           fromlist=["encrypt"]).encrypt("s3cr3t"))); db.commit()
    assert client.get("/metrics").status_code == 401
    assert client.get("/metrics", headers={"Authorization": "Bearer s3cr3t"}).status_code == 200


def test_admin_metrics_summary(client, ctx):
    r = client.get("/v1/admin/config/metrics-summary", headers=ctx["headers"])
    assert r.status_code == 200
    d = r.json()
    assert set(d) == {"cache", "queue", "db_pool"}
    assert "hit_rate" in d["cache"] and "audit_depth" in d["queue"]


def test_admin_metrics_summary_role_gated(client):
    assert client.get("/v1/admin/config/metrics-summary").status_code == 401


def test_cache_records_hit_and_miss():
    metrics.incr  # ensure importable
    key = cache.cache_key("t", "x")
    calls = {"n": 0}
    def producer():
        calls["n"] += 1
        return {"v": 1}
    cache.get_or_set(key, 60, producer)   # miss -> producer runs
    cache.get_or_set(key, 60, producer)   # hit  -> producer NOT run again
    assert calls["n"] == 1                # single-flight/caching: produced once
    snap = metrics.snapshot()
    assert snap["cache"]["hits"] >= 1 and snap["cache"]["misses"] >= 1


def test_domain_list_is_cached_and_invalidated(client, ctx, db):
    # first list warms the cache
    r1 = client.get("/v1/domains", headers=ctx["headers"])
    assert r1.status_code == 200
    n0 = len(r1.json())
    # register a new domain -> must invalidate the cached list
    body = {"url": f"cachetest{__import__('uuid').uuid4().hex[:6]}.gov.in"}
    assert client.post("/v1/domains", headers=ctx["headers"], json=body).status_code == 201
    r2 = client.get("/v1/domains", headers=ctx["headers"])
    assert len(r2.json()) == n0 + 1       # fresh, not a stale cached list
