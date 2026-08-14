"""Central configuration (env-driven)."""
from __future__ import annotations
from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "GovUX Audit Platform API"
    engine_version: str = "v3.2"
    env: str = "dev"                             # "production" enables fail-fast checks
    # browser origins allowed to call the credentialed API (CSV via GOVUX_CORS_ORIGINS)
    cors_origins: list[str] = ["http://localhost:3000"]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors(cls, v):
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v

    database_url: str = "postgresql+psycopg://govux:govux@db:5432/govux"
    redis_url: str = "redis://redis:6379/0"                    # durable queue + status
    # cache can live on a SEPARATE Redis in prod so a cache flush/eviction never
    # touches the durable job queue. Defaults to redis_url for single-node dev.
    cache_redis_url: str = ""
    # connection pool (per API process) — tune against Postgres max_connections
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_timeout: int = 30

    # auth
    jwt_secret: str = "change-me-in-prod"
    jwt_alg: str = "HS256"
    # master key for encrypting secret settings at rest (from a secret manager in prod)
    secret_key: str = ""
    access_ttl_seconds: int = 15 * 60            # 15 min
    refresh_ttl_seconds: int = 60 * 60 * 24 * 60  # 60 days
    # tolerate a just-rotated refresh token being presented again within this window
    # as a benign race (e.g. two components both refreshing off one stale cookie
    # right after a reload) rather than genuine reuse/theft, which cascades and
    # kills the whole session family. Standard refresh-token-rotation mitigation.
    refresh_reuse_grace_seconds: int = 10
    otp_ttl_seconds: int = 5 * 60                 # 5 min
    otp_max_attempts: int = 5
    allowed_email_suffixes: list[str] = [".gov.in", ".nic.in"]

    @field_validator("allowed_email_suffixes", mode="before")
    @classmethod
    def _parse_email_suffixes(cls, v):
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v

    # queue
    audit_stream: str = "govux:audits"
    consumer_group: str = "workers"

    # field data (CrUX) — blended into performance when a key is present (gap G4)
    crux_api_key: str = ""
    # scheduler
    scheduler_poll_seconds: int = 60
    # outbound webhook (CI/CD notifications) timeout
    webhook_timeout_seconds: int = 10
    # cap on documents audited per run (gap G3)
    max_documents_per_audit: int = 10

    # free public scanner + quotas
    public_scan_stream: str = "govux:public"
    public_consumer_group: str = "public-workers"
    # a scan still queued/running past this age has almost certainly lost its
    # queue message entirely (e.g. a Redis restart with no persistence) rather
    # than merely being slow — a single-page scan normally finishes in seconds.
    # The reconciler fails it out so it stops showing as a phantom ahead of
    # everyone else in the public queue position count.
    public_scan_stale_minutes: int = 30
    # same reconciliation for the main audit worker: an audit stuck in a non-
    # terminal state past this age has lost its Redis Streams message and will
    # never complete. The reconciler marks it failed so the domain is unblocked
    # for re-submission (the idempotency check looks at in-flight statuses).
    audit_stale_minutes: int = 60
    free_registered_pages: int = 10        # registered users may scan up to this many pages
    free_scan_suffixes: list[str] = [".gov.in", ".nic.in"]  # SSRF/abuse guard

    @field_validator("free_scan_suffixes", mode="before")
    @classmethod
    def _parse_scan_suffixes(cls, v):
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v

    # abuse control — free scanner (per IP) + sign-in brute force (per account)
    scan_ip_limit: int = 3                 # free scans/IP before a CAPTCHA is required
    scan_ip_window: int = 86400            # window (seconds) for the free-scan quota
    otp_request_ip_limit: int = 6          # OTP requests/IP/hour
    otp_fail_threshold: int = 3            # failed sign-ins before lock-out
    otp_lock_seconds: int = 600            # first lock: 10 minutes
    otp_lock_seconds_2: int = 1200         # escalated lock: 20 minutes (+ CAPTCHA)
    captcha_secret: str = ""               # Cloudflare Turnstile / reCAPTCHA secret (prod)

    # object storage (S3 / MinIO) for registered-user PDFs
    s3_endpoint: str = "http://minio:9000"
    s3_bucket: str = "govux-reports"
    s3_access_key: str = "govux"
    s3_secret_key: str = "govux-secret"
    s3_region: str = "us-east-1"

    class Config:
        env_prefix = "GOVUX_"


settings = Settings()
