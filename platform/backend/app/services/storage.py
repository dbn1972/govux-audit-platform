"""Object storage for report PDFs (S3 / MinIO).

Registered-user report PDFs are stored in an S3-compatible bucket and served via
short-lived presigned URLs. boto3 is imported lazily so the app never hard-depends
on it; if storage is unreachable the caller degrades gracefully.
"""
from __future__ import annotations
from ..config import settings

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
        print("storage put error:", exc)
        return None


def presigned_url(key: str, expires: int = 3600) -> str | None:  # pragma: no cover
    try:
        return _s3().generate_presigned_url(
            "get_object", Params={"Bucket": settings.s3_bucket, "Key": key}, ExpiresIn=expires)
    except Exception:
        return None


def get_pdf(key: str) -> bytes | None:  # pragma: no cover - needs network
    try:
        return _s3().get_object(Bucket=settings.s3_bucket, Key=key)["Body"].read()
    except Exception:
        return None
