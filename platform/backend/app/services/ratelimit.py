"""Redis fixed-window rate limiting. Fail-open: if Redis is unreachable the limiter
allows the request (availability over strictness) — the auth lock-out in
`authguard` is the hard security control."""
from __future__ import annotations
from . import queue   # reuse the shared Redis client (queue._r), referenced at call time

PREFIX = "govux:rl:"


def hit(key: str, window: int) -> int:
    """Increment the counter for `key` and return the new count. First hit sets TTL."""
    rk = PREFIX + key
    try:
        n = queue._r.incr(rk)
        if n == 1:
            queue._r.expire(rk, window)
        return int(n)
    except Exception:
        return 0   # fail-open


def count(key: str) -> int:
    try:
        v = queue._r.get(PREFIX + key)
        return int(v) if v else 0
    except Exception:
        return 0


def retry_after(key: str) -> int:
    try:
        return max(int(queue._r.ttl(PREFIX + key)), 0)
    except Exception:
        return 0
