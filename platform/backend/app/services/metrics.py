"""Lightweight metrics — no new dependency.

Counters live in Redis (INCR), so they aggregate correctly across gunicorn/uvicorn
worker processes. Gauges (queue depth, DLQ, pending, DB pool) are read live at
scrape time. Rendered directly in the Prometheus text exposition format.
"""
from __future__ import annotations

from . import queue
from ..config import settings

CPREFIX = "govux:metrics:"
COUNTERS = ["cache_hit", "cache_miss", "cache_error", "cache_fallback",
            "audit_enqueued", "public_enqueued"]


def incr(name: str, n: int = 1) -> None:
    """Best-effort counter increment (never fails a request)."""
    try:
        queue._r.incrby(CPREFIX + name, n)
    except Exception:
        pass


def _counters() -> dict:
    out = {}
    for name in COUNTERS:
        try:
            v = queue._r.get(CPREFIX + name)
        except Exception:
            v = None
        out[name] = int(v) if v else 0
    return out


def _xlen(stream: str) -> int:
    try:
        return int(queue._r.xlen(stream))
    except Exception:
        return -1


def _pending(stream: str, group: str) -> int:
    try:
        info = queue._r.xpending(stream, group)
        if isinstance(info, dict):
            return int(info.get("pending", 0))
        return int(info[0] or 0)          # older redis-py: [count, min, max, consumers]
    except Exception:
        return -1


def _pool() -> dict:
    try:
        from ..database import engine
        p = engine.pool
        return {"checked_out": p.checkedout(), "size": p.size(), "overflow": p.overflow()}
    except Exception:
        return {"checked_out": -1, "size": -1, "overflow": -1}


def snapshot() -> dict:
    c = _counters()
    hits, misses = c["cache_hit"], c["cache_miss"]
    total = hits + misses
    return {
        "cache": {"hits": hits, "misses": misses, "errors": c["cache_error"],
                  "fallbacks": c["cache_fallback"],
                  "hit_rate": round(hits / total, 4) if total else None},
        "queue": {
            "audit_depth": _xlen(settings.audit_stream),
            "audit_pending": _pending(settings.audit_stream, settings.consumer_group),
            "audit_dlq": _xlen(settings.audit_stream + ":dlq"),
            "public_depth": _xlen(settings.public_scan_stream),
            "audit_enqueued_total": c["audit_enqueued"],
            "public_enqueued_total": c["public_enqueued"],
        },
        "db_pool": _pool(),
    }


def render_prometheus() -> str:
    s = snapshot()
    lines: list[str] = []

    def m(name: str, val, typ: str, help_: str):
        lines.append(f"# HELP {name} {help_}")
        lines.append(f"# TYPE {name} {typ}")
        lines.append(f"{name} {val if val is not None else 'NaN'}")

    c, q, p = s["cache"], s["queue"], s["db_pool"]
    m("govux_cache_hits_total", c["hits"], "counter", "Cache hits")
    m("govux_cache_misses_total", c["misses"], "counter", "Cache misses")
    m("govux_cache_errors_total", c["errors"], "counter", "Cache backend errors (fell back to DB)")
    m("govux_cache_fallbacks_total", c["fallbacks"], "counter", "Reads served straight from DB")
    m("govux_cache_hit_rate", c["hit_rate"], "gauge", "Cache hit rate 0..1")
    m("govux_queue_audit_depth", q["audit_depth"], "gauge", "Audit stream length")
    m("govux_queue_audit_pending", q["audit_pending"], "gauge", "Unacked audit jobs (pending list)")
    m("govux_queue_audit_dlq", q["audit_dlq"], "gauge", "Audit dead-letter queue length")
    m("govux_queue_public_depth", q["public_depth"], "gauge", "Public scan stream length")
    m("govux_queue_audit_enqueued_total", q["audit_enqueued_total"], "counter", "Audits enqueued")
    m("govux_db_pool_checked_out", p["checked_out"], "gauge", "DB connections checked out")
    m("govux_db_pool_size", p["size"], "gauge", "DB pool size")
    return "\n".join(lines) + "\n"
