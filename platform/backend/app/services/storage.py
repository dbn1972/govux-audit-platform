"""Object storage for report PDFs (S3 / MinIO).

Registered-user report PDFs are stored in an S3-compatible bucket and served via
short-lived presigned URLs. boto3 is imported lazily so the app never hard-depends
on it; if storage is unreachable the caller degrades gracefully.
"""
from __future__ import annotations
from ..config import settings
from ..logging import get_logger

logger = get_logger("storage")

_client = None


def _s3():  # pragma: no cover - needs network/boto3
    global _client
    if _client is None:
        import boto3
        _client = boto3.client(
            "s3", endpoint_url=settings.s3_endpoint,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region)
        try:
            _client.head_bucket(Bucket=settings.s3_bucket)
        except Exception:
            try:
                _client.create_bucket(Bucket=settings.s3_bucket)
            except Exception:
                pass
    return _client


def put_pdf(key: str, data: bytes) -> str | None:  # pragma: no cover - needs network
    """Store PDF bytes; return the object key, or None on failure."""
    try:
        _s3().put_object(Bucket=settings.s3_bucket, Key=key, Body=data,
                         ContentType="application/pdf")
        return key
    except Exception as exc:
        # Returning None here is a silent degradation for the caller, so this is
        # the only trace that a report PDF was never stored — it needs the key
        # and a traceback to be actionable.
        logger.error("storage_put_error", key=key, bucket=settings.s3_bucket,
                     error=str(exc), exc_info=True)
        return None


def presigned_url(key: str, expires: int = 3600) -> str | None:  # pragma: no cover
    try:
        return _s3().generate_presigned_url(
            "get_object", Params={"Bucket": settings.s3_bucket, "Key": key}, ExpiresIn=expires)
    except Exception as exc:
        # These two used to swallow the exception with no output whatsoever, so
        # an unreachable bucket surfaced as a report the user simply could not
        # download, with nothing in the logs to explain it.
        logger.error("storage_presign_error", key=key, error=str(exc), exc_info=True)
        return None


def get_pdf(key: str) -> bytes | None:  # pragma: no cover - needs network
    try:
        return _s3().get_object(Bucket=settings.s3_bucket, Key=key)["Body"].read()
    except Exception as exc:
        logger.error("storage_get_error", key=key, error=str(exc), exc_info=True)
        return None
