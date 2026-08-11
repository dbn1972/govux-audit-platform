"""Redis Streams job queue — one language-agnostic queue that Node and Python
workers both consume (no Celery). Retries/DLQ are native to Redis Streams."""
import json
import redis
from ..config import settings

_r = redis.from_url(settings.redis_url, decode_responses=True)


def enqueue_audit(task_id: str, payload: dict) -> str:
    """Add an audit job to the stream. Returns the stream entry id."""
    try:
        eid = _r.xadd(settings.audit_stream, {"task_id": task_id, "payload": json.dumps(payload)})
        try:
            _r.incr("govux:metrics:audit_enqueued")
        except Exception:
            pass
        return eid
    except Exception:
        # Redis Streams not available (e.g. Redis < 5.0 on Windows dev) — job stored
        # in DB but not dispatched to stream. Worker won't pick it up until Redis is
        # upgraded, but the API won't crash.
        return "dev-no-stream"


def audit_depth() -> int:
    """Current audit-stream length (for backpressure / monitoring). -1 if unknown."""
    try:
        return int(_r.xlen(settings.audit_stream))
    except Exception:
        return -1


def ensure_group():
    """Create the consumer group if it does not exist (idempotent)."""
    try:
        _r.xgroup_create(settings.audit_stream, settings.consumer_group, id="0", mkstream=True)
    except (redis.ResponseError, Exception):
        pass  # group already exists or Streams not supported


def read_jobs(consumer: str, count: int = 1, block_ms: int = 5000):
    """A worker (any language) reads pending jobs from the group."""
    return _r.xreadgroup(
        settings.consumer_group, consumer,
        {settings.audit_stream: ">"}, count=count, block=block_ms,
    )


def ack(entry_id: str):
    _r.xack(settings.audit_stream, settings.consumer_group, entry_id)


# ---------- crash recovery: reclaim jobs stuck in a dead worker's PEL ----------
MAX_DELIVERIES = 3                       # poison-message cutoff
DLQ_STREAM = settings.audit_stream + ":dlq"


def reclaim_stale(consumer: str, min_idle_ms: int = 120_000, count: int = 10):
    """Reclaim audit jobs whose owning worker died mid-run (idle in the PEL past
    `min_idle_ms`) back to `consumer`. A job redelivered more than MAX_DELIVERIES
    times is poison — route it to the DLQ stream and ack it so it stops cycling.
    Returns the live jobs to (re)process as [(entry_id, data), ...]."""
    try:
        res = _r.xautoclaim(settings.audit_stream, settings.consumer_group, consumer,
                            min_idle_time=min_idle_ms, start_id="0-0", count=count)
    except redis.ResponseError:
        return []
    claimed = res[1] if isinstance(res, (list, tuple)) and len(res) >= 2 else []
    live = []
    for entry_id, data in claimed:
        pend = _r.xpending_range(settings.audit_stream, settings.consumer_group,
                                 min=entry_id, max=entry_id, count=1)
        deliveries = int(pend[0]["times_delivered"]) if pend else 1
        if deliveries > MAX_DELIVERIES:
            _r.xadd(DLQ_STREAM, {**data, "dlq_reason": "max-deliveries", "src_id": str(entry_id)})
            _r.xack(settings.audit_stream, settings.consumer_group, entry_id)
        else:
            live.append((entry_id, data))
    return live


def set_status(task_id: str, status: str, progress: dict | None = None):
    """Publish live status for polling / WebSocket."""
    try:
        _r.hset(f"govux:status:{task_id}", mapping={"status": status, **(progress or {})})
        _r.publish(f"govux:events:{task_id}", json.dumps({"status": status, **(progress or {})}))
    except Exception:
        pass  # Redis unavailable or command not supported

# ---------- free public scan queue (single-concurrency) ----------
def ensure_public_group():
    try:
        _r.xgroup_create(settings.public_scan_stream, settings.public_consumer_group, id="0", mkstream=True)
    except redis.ResponseError:
        pass


def enqueue_public(scan_id: str, payload: dict) -> str:
    return _r.xadd(settings.public_scan_stream, {"scan_id": scan_id, "payload": json.dumps(payload)})


def read_public(consumer: str, count: int = 1, block_ms: int = 5000):
    return _r.xreadgroup(settings.public_consumer_group, consumer,
                         {settings.public_scan_stream: ">"}, count=count, block=block_ms)


def ack_public(entry_id: str):
    _r.xack(settings.public_scan_stream, settings.public_consumer_group, entry_id)


# ---------- public-scan crash recovery (mirrors reclaim_stale above) ----------
PUBLIC_MAX_DELIVERIES = 3
PUBLIC_DLQ_STREAM = settings.public_scan_stream + ":dlq"


def reclaim_stale_public(consumer: str, min_idle_ms: int = 120_000, count: int = 10):
    """Reclaim public-scan jobs whose owning worker died mid-run (idle in the
    PEL past `min_idle_ms`) back to `consumer`. Without this the single-
    concurrency free scanner has no crash recovery at all: one dead process
    mid-scan stalls every scan behind it forever."""
    try:
        res = _r.xautoclaim(settings.public_scan_stream, settings.public_consumer_group, consumer,
                            min_idle_time=min_idle_ms, start_id="0-0", count=count)
    except redis.ResponseError:
        return []
    claimed = res[1] if isinstance(res, (list, tuple)) and len(res) >= 2 else []
    live = []
    for entry_id, data in claimed:
        pend = _r.xpending_range(settings.public_scan_stream, settings.public_consumer_group,
                                 min=entry_id, max=entry_id, count=1)
        deliveries = int(pend[0]["times_delivered"]) if pend else 1
        if deliveries > PUBLIC_MAX_DELIVERIES:
            _r.xadd(PUBLIC_DLQ_STREAM, {**data, "dlq_reason": "max-deliveries", "src_id": str(entry_id)})
            _r.xack(settings.public_scan_stream, settings.public_consumer_group, entry_id)
        else:
            live.append((entry_id, data))
    return live
