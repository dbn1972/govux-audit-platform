"""Pydantic request/response models (drive the OpenAPI spec)."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field


# ---------- auth ----------
class OtpRequest(BaseModel):
    email: EmailStr


class OtpVerify(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)
    device_pubkey: str = Field(description="Non-extractable device public key (DBSC/WebAuthn)")
    device_label: Optional[str] = None
    trust_device: bool = True
    captcha: Optional[str] = None   # required after repeated failures


class TokenPair(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    # refresh token is set as an HttpOnly cookie, not returned in the body


class OrganisationUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    state_code: Optional[str] = Field(None, max_length=8)


class RoleUpdate(BaseModel):
    role: str


class DeviceOut(BaseModel):
    id: str
    label: Optional[str]
    last_location: Optional[str]
    last_active_at: datetime
    trusted: bool
    current: bool = False


# ---------- audits ----------
class AuditCreate(BaseModel):
    domain_id: str
    # free tier; >10 needs admin approval (scan_requests). >=1: the engine's JS
    # side falls back to its 25-page default on a falsy depth (0), so 0 must
    # never reach it looking like "unset".
    depth: int = Field(10, ge=1)
    devices: list[str] = ["desktop", "mobile"]
    browsers: list[str] = ["chromium", "firefox", "webkit"]
    webhook_url: Optional[str] = None


class AuditAccepted(BaseModel):
    task_id: str
    status: str = "queued"
    status_url: str
    poll_after: int = 5


class AuditStatus(BaseModel):
    task_id: str
    domain: str
    status: str
    pages_done: int
    pages_total: int
    overall_score: Optional[float] = None
    band: Optional[str] = None
    guardrail_active: bool = False
    compliance_status: Optional[str] = None   # legal verdict, separate from band (G1)
    method: Optional[str] = None
    confidence: Optional[str] = None


# ---------- monitoring / discovery / CI ----------
class ScheduleCreate(BaseModel):
    domain_id: str
    cadence: str = Field("weekly", description="daily | weekly | monthly")


class DiscoverySample(BaseModel):
    seed: str
    body: str
    kind: str = "auto"          # sitemap | robots | html | auto


class DiscoveryScan(BaseModel):
    samples: list[DiscoverySample] = []


class CategoryScore(BaseModel):
    category: str
    weight: float
    score: float


class BulkScanCreate(BaseModel):
    mode: str = Field("auto_discover", description="auto_discover | list")
    domains: list[str] = []
    scope: str = "never_audited"
    depth: int = Field(50, ge=1)   # clamped to the engine's 25-page ceiling regardless
