"""SQLAlchemy models mirroring db/schema.sql (core tables)."""
import uuid
from datetime import datetime
from sqlalchemy import (
    Column, Text, Boolean, Integer, BigInteger, Numeric, ForeignKey, DateTime, func,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, INET, ENUM
from .database import Base


def _uuid():
    return uuid.uuid4()


# Postgres ENUM types — must mirror the CREATE TYPE statements in db/schema.sql.
UserRole = ENUM("owner", "contributor", "assessor", "programme_admin", "super_admin",
                name="user_role")
OrgType = ENUM("ministry", "department", "state", "ut", "psu", "other", name="org_type")
VerifyMethod = ENUM("dns_txt", "file_upload", "sso_mapping", name="verify_method")
VerifyStatus = ENUM("pending", "verified", "failed", name="verify_status")
AuditStatus = ENUM("queued", "crawling", "analyzing", "scoring", "completed",
                   "partial", "failed", "cancelled", name="audit_status")
PageStatus = ENUM("discovered", "analysed", "timed_out", "skipped", "error",
                  name="page_status")
PublishMode = ENUM("internal", "public", name="publish_mode")
Severity = ENUM("critical", "high", "medium", "low", name="severity")
FindingState = ENUM("open", "in_progress", "resolved", "not_applicable",
                    name="finding_state")
Band = ENUM("A", "B", "C", "D", "E", name="band")


class Organisation(Base):
    __tablename__ = "organisations"
    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    name = Column(Text, nullable=False)
    org_type = Column(OrgType, nullable=False)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("organisations.id"))
    state_code = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"
    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    email = Column(Text, unique=True, nullable=False)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organisations.id"))
    display_name = Column(Text)
    role = Column(UserRole, nullable=False, default="owner")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login_at = Column(DateTime(timezone=True))


class OtpCode(Base):
    __tablename__ = "otp_codes"
    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    email = Column(Text, nullable=False)
    code_hash = Column(Text, nullable=False)
    purpose = Column(Text, nullable=False, default="login")
    expires_at = Column(DateTime(timezone=True), nullable=False)
    consumed_at = Column(DateTime(timezone=True))
    attempts = Column(Integer, nullable=False, default=0)
    created_ip = Column(INET)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Device(Base):
    __tablename__ = "devices"
    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    device_pubkey = Column(Text, nullable=False)
    label = Column(Text)
    user_agent = Column(Text)
    last_ip = Column(INET)
    last_location = Column(Text)
    trusted = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_active_at = Column(DateTime(timezone=True), server_default=func.now())


class Session(Base):
    __tablename__ = "sessions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    device_id = Column(UUID(as_uuid=True), ForeignKey("devices.id"), nullable=False)
    refresh_token_hash = Column(Text, nullable=False)
    family_id = Column(UUID(as_uuid=True), nullable=False, default=_uuid)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    rotated_at = Column(DateTime(timezone=True), server_default=func.now())


class Domain(Base):
    __tablename__ = "domains"
    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organisations.id"), nullable=False)
    url = Column(Text, unique=True, nullable=False)
    tld = Column(Text, nullable=False)
    service_category = Column(Text)
    size_class = Column(Text)
    verify_method = Column(VerifyMethod)
    verify_status = Column(VerifyStatus, nullable=False, default="pending")
    verify_token = Column(Text)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Audit(Base):
    __tablename__ = "audits"
    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)  # task_id
    domain_id = Column(UUID(as_uuid=True), ForeignKey("domains.id"), nullable=False)
    status = Column(AuditStatus, nullable=False, default="queued")
    scope = Column(JSONB, nullable=False, default=dict)
    engine_version = Column(Text, nullable=False)
    batch_id = Column(UUID(as_uuid=True))
    requested_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    pages_total = Column(Integer, nullable=False, default=0)
    pages_done = Column(Integer, nullable=False, default=0)
    overall_score = Column(Numeric(5, 2))
    band = Column(Band)
    guardrail_active = Column(Boolean, nullable=False, default=False)
    compliance_status = Column(Text)      # legal verdict, separate from band (G1)
    method = Column(Text, nullable=False, default="automated")
    confidence = Column(Text, nullable=False, default="automated_only")
    field_data = Column(JSONB)            # CrUX real-user metrics (G4)
    anomaly_score = Column(Numeric(6, 3))  # advisory ML — NOT in the score path
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True))
    finished_at = Column(DateTime(timezone=True))


class AuditScore(Base):
    __tablename__ = "audit_scores"
    audit_id = Column(UUID(as_uuid=True), ForeignKey("audits.id"), primary_key=True)
    category = Column(Text, primary_key=True)
    weight = Column(Numeric(4, 1), nullable=False)
    score = Column(Numeric(5, 2), nullable=False)


class AuditPage(Base):
    __tablename__ = "audit_pages"
    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    audit_id = Column(UUID(as_uuid=True), ForeignKey("audits.id"), nullable=False)
    url = Column(Text, nullable=False)
    status = Column(PageStatus, nullable=False, default="discovered")
    device = Column(Text)
    lcp_ms = Column(Integer)
    inp_ms = Column(Integer)
    cls = Column(Numeric(4, 3))
    page_score = Column(Numeric(5, 2))
    issue_count = Column(Integer, nullable=False, default=0)
    crawled_at = Column(DateTime(timezone=True))


class Guideline(Base):
    __tablename__ = "guidelines"
    id = Column(Text, primary_key=True)
    family = Column(Text, nullable=False)
    category = Column(Text, nullable=False)
    title = Column(Text, nullable=False)
    plain_language = Column(Text)
    good_example = Column(Text)
    version = Column(Text)


class Finding(Base):
    __tablename__ = "findings"
    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    audit_id = Column(UUID(as_uuid=True), ForeignKey("audits.id"), nullable=False)
    page_id = Column(UUID(as_uuid=True), ForeignKey("audit_pages.id"))
    guideline_id = Column(Text)
    category = Column(Text, nullable=False)
    severity = Column(Severity, nullable=False)
    effort = Column(Text)
    element = Column(Text)
    evidence_ref = Column(Text)
    state = Column(FindingState, nullable=False, default="open")
    is_reviewed = Column(Boolean, nullable=False, default=False)
    confidence = Column(Text, nullable=False, default="automated")  # automated | needs_review | confirmed
    remediation = Column(Text)            # advisory fix guidance (G5)
    title = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AuditDocument(Base):
    __tablename__ = "audit_documents"
    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    audit_id = Column(UUID(as_uuid=True), ForeignKey("audits.id"), nullable=False)
    url = Column(Text, nullable=False)
    doc_type = Column(Text, nullable=False, default="pdf")
    pages = Column(Integer)
    tagged = Column(Boolean)
    has_title = Column(Boolean)
    has_lang = Column(Boolean)
    score = Column(Numeric(5, 2))
    issue_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AuditBrowser(Base):
    __tablename__ = "audit_browsers"
    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    audit_id = Column(UUID(as_uuid=True), ForeignKey("audits.id"), nullable=False)
    engine = Column(Text, nullable=False)
    loaded = Column(Boolean)
    status = Column(Integer)
    js_errors = Column(Integer)
    console_errors = Column(Integer)
    overflow = Column(Boolean)
    broken_images = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Schedule(Base):
    __tablename__ = "schedules"
    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    domain_id = Column(UUID(as_uuid=True), ForeignKey("domains.id"), nullable=False)
    cadence = Column(Text, nullable=False, default="weekly")
    enabled = Column(Boolean, nullable=False, default=True)
    next_run_at = Column(DateTime(timezone=True), nullable=False)
    last_run_at = Column(DateTime(timezone=True))
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PublicScan(Base):
    __tablename__ = "public_scans"
    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    url = Column(Text, nullable=False)
    host = Column(Text)
    status = Column(Text, nullable=False, default="queued")
    requested_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    overall_score = Column(Numeric(5, 2))
    band = Column(Text)
    pdf_key = Column(Text)
    ip = Column(INET)
    error = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True))
    finished_at = Column(DateTime(timezone=True))


class ScanRequest(Base):
    __tablename__ = "scan_requests"
    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    domain_id = Column(UUID(as_uuid=True), ForeignKey("domains.id"))
    requested_pages = Column(Integer, nullable=False)
    reason = Column(Text)
    status = Column(Text, nullable=False, default="pending")
    decided_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    decided_at = Column(DateTime(timezone=True))


class AuditLog(Base):
    __tablename__ = "audit_log"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    actor_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    action = Column(Text, nullable=False)
    target = Column(Text)
    ip = Column(INET)
    device_id = Column(UUID(as_uuid=True), ForeignKey("devices.id"))
    detail = Column(JSONB)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AppSetting(Base):
    __tablename__ = "app_settings"
    key = Column(Text, primary_key=True)
    value = Column(Text)
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class DiscoveredDomain(Base):
    __tablename__ = "discovered_domains"
    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    url = Column(Text, unique=True, nullable=False)
    source = Column(Text)
    seed = Column(Text)
    imported = Column(Boolean, nullable=False, default=False)
    discovered_at = Column(DateTime(timezone=True), server_default=func.now())


class RankingPublication(Base):
    """Governance-gated publication of a segmented ranking (mirrors schema.sql).

    Previously present in db/schema.sql with no ORM model — closes invariant #5
    (schema.sql ⇄ models.py ⇄ Alembic must stay in sync)."""
    __tablename__ = "ranking_publications"
    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    segment = Column(JSONB, nullable=False)          # {category, size_class, org_scope}
    mode = Column(PublishMode, nullable=False, default="internal")
    approved_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    methodology_version = Column(Text, nullable=False)
    published_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
