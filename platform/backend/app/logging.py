"""Structured logging configuration using structlog.

JSON output in production (GOVUX_ENV=production), human-readable console in dev.
Every log event carries: timestamp, level, logger name, and any bound context
(task_id, consumer, scan_id). This replaces bare print() calls in the workers.
"""
import logging
import sys

import structlog

from .config import settings


def configure_logging():
    """Call once at process startup (worker, scheduler, public_worker, API)."""
    shared_processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]

    if settings.env == "production":
        # JSON lines for log aggregation (ELK, CloudWatch, Loki)
        renderer = structlog.processors.JSONRenderer()
    else:
        # Pretty console for local dev
        renderer = structlog.dev.ConsoleRenderer()

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)

    # Quiet noisy libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """Get a structured logger bound to the given name."""
    return structlog.get_logger(name)
