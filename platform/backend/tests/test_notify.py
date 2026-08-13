"""Notification delivery — audit lifecycle, regressions, approval requests.

The platform previously sent nothing but sign-in OTPs, so "continuous
monitoring" never actually reached a human. These tests pin who gets told what,
and the two properties that matter most operationally: notifications must never
break the thing that triggered them, and the regression threshold must match the
one the /admin/alerts screen uses.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from app import models
from app.services import notify, settings_store


@pytest.fixture
def outbox(monkeypatch):
    """Capture what would have been sent instead of hitting a provider."""
    sent = []
    monkeypatch.setattr(notify.email_svc, "send",
                        lambda to, subject, body: (sent.append((to, subject, body)), True)[1])
    return sent


def _domain(db, ctx, url=None):
    d = models.Domain(org_id=ctx["org"].id, url=url or f"n{uuid.uuid4().hex[:6]}.gov.in",
                      tld="gov.in", verify_status="verified", created_by=ctx["user"].id)
    db.add(d); db.flush()
    return d


def _audit(db, domain, ctx, score=70, band="C", status="completed", created_at=None):
    a = models.Audit(domain_id=domain.id, engine_version="test", status=status,
                     requested_by=ctx["user"].id, overall_score=score, band=band,
                     compliance_status="partially_compliant", pages_done=3, pages_total=3,
                     created_at=created_at or datetime.now(timezone.utc))
    db.add(a); db.flush()
    return a


# ---------- audit lifecycle -------------------------------------------------
def test_completion_emails_the_requester_with_score_and_link(db, ctx, outbox):
    d = _domain(db, ctx)
    a = _audit(db, d, ctx, score=81, band="B")
    db.commit()

    assert notify.audit_completed(db, a, d) == 1
    to, subject, body = outbox[0]
    assert to == ctx["user"].email
    assert d.url in subject and "81" in subject and "Band B" in subject
    assert f"/audits/{a.id}/report" in body


def test_failure_emails_the_requester_with_the_reason(db, ctx, outbox):
    d = _domain(db, ctx)
    a = _audit(db, d, ctx, score=None, band=None, status="failed")
    db.commit()

    assert notify.audit_failed(db, a, d, "engine timed out after 600s") == 1
    _, subject, body = outbox[0]
    assert "failed" in subject.lower() and d.url in subject
    assert "engine timed out" in body


# ---------- regressions -----------------------------------------------------
def test_regression_alerts_org_admins_not_just_the_requester(db, ctx, outbox):
    """A drop is an organisational problem, so the accountable roles are told —
    and only those roles (a contributor shouldn't be paged)."""
    d = _domain(db, ctx)
    owner = models.User(email=f"own.{uuid.uuid4().hex[:6]}@nic.in", org_id=ctx["org"].id, role="owner")
    contrib = models.User(email=f"con.{uuid.uuid4().hex[:6]}@nic.in", org_id=ctx["org"].id, role="contributor")
    db.add_all([owner, contrib])
    # Dated well outside the 30-day window that /v1/alerts aggregates over.
    # The regression NOTIFIER compares against the previous audit regardless of
    # age, so this still exercises the real path — but a 12-point drop left in
    # the window would outrank test_rankings_library's 10-point one and steal
    # its "worst regression" callout (both tests share this database).
    old = datetime.now(timezone.utc) - timedelta(days=200)
    _audit(db, d, ctx, score=80, band="B", created_at=old)
    latest = _audit(db, d, ctx, score=68, band="C", created_at=old + timedelta(days=7))
    db.commit()

    notify.audit_completed(db, latest, d)
    recipients = {to for to, _, _ in outbox}
    assert owner.email in recipients
    assert contrib.email not in recipients

    regression = [s for _, s, _ in outbox if "regression" in s.lower()]
    assert regression and "12 points" in regression[0]


def test_drop_below_five_points_is_not_a_regression(db, ctx, outbox):
    """Threshold must match _alerts() in routers/rankings.py, or the email and
    the dashboard would disagree about what counts."""
    d = _domain(db, ctx)
    _audit(db, d, ctx, score=80, band="B", created_at=datetime.now(timezone.utc) - timedelta(days=7))
    latest = _audit(db, d, ctx, score=76, band="B")     # -4
    db.commit()

    notify.audit_completed(db, latest, d)
    assert not [s for _, s, _ in outbox if "regression" in s.lower()]


def test_first_ever_audit_is_never_a_regression(db, ctx, outbox):
    d = _domain(db, ctx)
    a = _audit(db, d, ctx, score=30, band="E")
    db.commit()
    notify.audit_completed(db, a, d)
    assert not [s for _, s, _ in outbox if "regression" in s.lower()]


# ---------- scan-request approvals ------------------------------------------
def test_request_notifies_approvers_and_decision_notifies_requester(db, ctx, outbox):
    d = _domain(db, ctx)
    requester = models.User(email=f"req.{uuid.uuid4().hex[:6]}@nic.in",
                            org_id=ctx["org"].id, role="contributor")
    db.add(requester); db.flush()
    owner = models.User(email=f"own.{uuid.uuid4().hex[:6]}@nic.in", org_id=ctx["org"].id, role="owner")
    db.add(owner)
    r = models.ScanRequest(user_id=requester.id, domain_id=d.id, requested_pages=50,
                           reason="full portal review", status="pending")
    db.add(r); db.commit()

    notify.scan_request_raised(db, r, d, requester)
    assert owner.email in {to for to, _, _ in outbox}
    assert "full portal review" in outbox[0][2]

    outbox.clear()
    r.status = "approved"; db.commit()
    notify.scan_request_decided(db, r, d)
    assert outbox[0][0] == requester.email
    assert "approved" in outbox[0][1]


# ---------- operational safety ----------------------------------------------
def test_master_switch_and_per_event_flags_suppress_mail(db, ctx, outbox):
    d = _domain(db, ctx)
    a = _audit(db, d, ctx)
    db.commit()

    settings_store.set_value("notify_enabled", "false", db)
    assert notify.audit_completed(db, a, d) == 0

    settings_store.set_value("notify_enabled", "true", db)
    settings_store.set_value("notify_audit_complete", "false", db)
    assert notify.audit_completed(db, a, d) == 0
    assert outbox == []


def test_a_broken_mail_provider_never_propagates(db, ctx, monkeypatch):
    """The whole point of the try/except in notify: a relay outage must not turn
    a completed audit into a failed one."""
    def boom(*a, **k):
        raise RuntimeError("smtp relay unreachable")
    monkeypatch.setattr(notify.email_svc, "send", boom)

    d = _domain(db, ctx)
    a = _audit(db, d, ctx)
    db.commit()
    assert notify.audit_completed(db, a, d) == 0        # swallowed, not raised
    assert notify.audit_failed(db, a, d, "x") == 0


def test_inactive_recipients_are_skipped(db, ctx, outbox):
    d = _domain(db, ctx)
    a = _audit(db, d, ctx)
    ctx["user"].is_active = False
    db.commit()
    assert notify.audit_completed(db, a, d) == 0
