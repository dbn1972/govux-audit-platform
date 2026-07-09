# Data-access policy — reads, writes, queue & cache (read on demand)

**Postgres is the system of record. Redis is a queue + cache, never the source of truth.**
A government audit platform must keep a reproducible score and a tamper-evident `audit_log`;
Redis can lose data, so it never owns truth. This policy applies the "read from Redis / write via
queue" idea *where it is correct* and keeps consistency-critical paths on Postgres.

## Write path
- **Queue-then-worker (async) for heavy / derivable writes:** an audit is `POST /v1/audits` → 202 +
  task_id → Redis Streams → `worker.process` writes scores/findings/pages/documents to Postgres.
  Bulk and scheduled scans use the same path. This is the "write via queue" pattern — use it for any
  new expensive, retry-able, non-interactive write.
- **Synchronous on Postgres for transactional / consistency-critical writes** — do NOT queue these:
  - Auth: OTP issue/verify-and-consume, device registration, refresh-token rotation + reuse
    detection (each needs a single transaction; queuing breaks the security model).
  - Domain register/verify (needs the `UNIQUE`/`CHECK` constraints and read-your-writes).
  - Manual finding review (`PATCH /v1/findings`) — an interactive edit the user expects to persist now.
  - The initial `audits` row + idempotency guard (must be committed before enqueue).

## Read path
- **Cache-aside (read from Redis) for read-heavy, cacheable aggregates:** `/v1/national`,
  `/v1/rankings` go through `services/cache.get_or_set(key, ttl, producer)` — read Redis, on miss read
  Postgres and populate (TTL 120 s). Add new expensive read-mostly aggregates here (dashboards,
  league tables, guideline library). **Redis being down falls back to Postgres — never a 500.**
- **Direct Postgres for consistency-critical reads** — do NOT cache:
  - Anything in the auth flow, the idempotency check, or a resource you just wrote and must read back.
  - A single audit's live status/report (freshness matters; it's already cheap by PK).

## Invalidation
A write that changes an aggregate must drop its cache. The worker calls
`cache.invalidate_prefix("national")` and `("rankings")` on audit completion. When you add a cached
aggregate, invalidate it from whatever write changes it (or accept staleness bounded by the TTL).

## Why not "Redis as source of truth / all writes async"
It would (1) risk data loss on a compliance record, (2) break `UNIQUE`/`CHECK`/transaction guarantees
and audit idempotency, (3) make auth insecure (no atomic check-and-consume / reuse detection), and
(4) destroy read-your-writes for interactive edits. Cache-aside gives the read-latency win without any
of that.

## Adding a cached read (checklist)
1. Wrap the DB query in `cache.get_or_set(cache.cache_key(name, *params), ttl, lambda: _query(db))`.
2. Keep the raw query in a private `_name(db, …)` helper (so it's testable and reusable).
3. Invalidate on the write that changes it.
4. Tests run against an in-memory `FakeRedis` (conftest) so the real cache logic is exercised
   deterministically; add hit/miss/invalidate/fallback cases to `tests/test_cache.py`.
