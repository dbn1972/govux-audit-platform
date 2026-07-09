"""Read-through (cache-aside) layer over Redis.

Policy (see docs/DATA_ACCESS.md): Postgres is the system of record; Redis is a
cache, never the source of truth. Read-heavy, cacheable aggregates read from
Redis first and fall back to Postgres on a miss — and, crucially, on any Redis
error — so a cache outage degrades to a slower DB read, never a 500. Writes that
change an aggregate invalidate its keys.

Do NOT cache consistency-critical reads (auth, idempotency checks, a resource you
just wrote): call the DB directly for those.
"""
from __future__ import annotations
import json
from typing import Callable

import redis
from ..config import settings

# module-level client, referenced at call time so tests can monkeypatch cache._r.
# Uses a dedicated cache Redis when configured (prod), else shares the queue Redis.
_r = redis.from_url(settings.cache_redis_url or settings.redis_url, decode_responses=True)

PREFIX = "govux:cache:"


def cache_key(*parts) -> str:
    return PREFIX + ":".join(str(p) for p in parts)


def get_or_set(key: str, ttl: int, producer: Callable[[], object],
               *, lock_ttl: int = 10, wait_ms: int = 800):
    """Return cached JSON at `key`; on miss/error compute via `producer`, store, return.

    Redis being unreachable is non-fatal — we always fall back to the producer (DB).
    Stampede protection: on a miss, a single caller acquires a short lock and fills
    the cache while concurrent callers briefly wait for the fill, so a hot key can't
    unleash a thundering herd of identical DB queries. Instrumented for hit-rate.
    """
    import time
    from . import metrics
    try:
        hit = _r.get(key)
        if hit is not None:
            metrics.incr("cache_hit")
            return json.loads(hit)
    except Exception:
        metrics.incr("cache_error"); metrics.incr("cache_fallback")
        return producer()          # Redis down -> read the source of truth
    metrics.incr("cache_miss")

    # single-flight: one caller computes; concurrent callers wait for the fill
    lock = key + ":lock"
    try:
        got = bool(_r.set(lock, "1", nx=True, ex=lock_ttl))
    except Exception:
        got = True                  # lock backend flaky -> just compute
    if not got:
        waited = 0.0
        while waited < wait_ms / 1000.0:
            time.sleep(0.05); waited += 0.05
            try:
                hit = _r.get(key)
                if hit is not None:
                    metrics.incr("cache_hit")
                    return json.loads(hit)
            except Exception:
                break
        metrics.incr("cache_fallback")   # filler slow/failed -> read DB rather than block
        return producer()

    try:
        value = producer()
        try:
            _r.setex(key, ttl, json.dumps(value, default=str))
        except Exception:
            pass                    # best-effort populate; never fail the read
        return value
    finally:
        try:
            _r.delete(lock)
        except Exception:
            pass


def invalidate(*keys: str) -> None:
    try:
        if keys:
            _r.delete(*keys)
    except Exception:
        pass


def invalidate_prefix(prefix: str) -> None:
    """Drop every cache entry under a logical prefix (e.g. after an audit completes)."""
    try:
        for k in _r.scan_iter(match=cache_key(prefix) + "*"):
            _r.delete(k)
    except Exception:
        pass
