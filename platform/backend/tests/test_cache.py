"""Cache-aside layer: read-through, invalidation, and graceful DB fallback."""
from app.services import cache


def test_miss_then_hit_uses_producer_once(monkeypatch):
    calls = {"n": 0}
    def producer():
        calls["n"] += 1
        return {"v": 42}
    key = cache.cache_key("t", "hit")
    assert cache.get_or_set(key, 60, producer) == {"v": 42}   # miss -> producer
    assert cache.get_or_set(key, 60, producer) == {"v": 42}   # hit  -> no producer
    assert calls["n"] == 1


def test_invalidate_forces_recompute():
    key = cache.cache_key("t", "inv")
    cache.get_or_set(key, 60, lambda: {"v": 1})
    cache.invalidate(key)
    assert cache.get_or_set(key, 60, lambda: {"v": 2}) == {"v": 2}


def test_invalidate_prefix_drops_group():
    cache.get_or_set(cache.cache_key("national"), 60, lambda: {"a": 1})
    cache.get_or_set(cache.cache_key("rankings", "x", "-"), 60, lambda: {"b": 2})
    cache.invalidate_prefix("national")
    # national recomputes, rankings still cached
    assert cache.get_or_set(cache.cache_key("national"), 60, lambda: {"a": 9}) == {"a": 9}
    assert cache.get_or_set(cache.cache_key("rankings", "x", "-"), 60, lambda: {"b": 9}) == {"b": 2}


def test_redis_down_falls_back_to_db(monkeypatch):
    class Broken:
        def get(self, k): raise RuntimeError("redis down")
        def setex(self, *a): raise RuntimeError("redis down")
    monkeypatch.setattr(cache, "_r", Broken())
    # never raises — always returns the producer's value (the source of truth)
    assert cache.get_or_set(cache.cache_key("t", "down"), 60, lambda: {"ok": True}) == {"ok": True}


def test_cached_endpoint_still_serves(client, ctx):
    # national goes through cache-aside (fake redis) and returns correctly
    r1 = client.get("/v1/national", headers=ctx["headers"])
    r2 = client.get("/v1/national", headers=ctx["headers"])
    assert r1.status_code == 200 and r2.status_code == 200
    assert "band_distribution" in r1.json()
