"""Outbound notifications — telling people things actually happened.

Before this, `services/email.py` sent exactly two kinds of message: a sign-in
OTP and an admin test mail. Nothing ever told a user that their audit had
finished, that a monitored domain had regressed, or that a scan request was
waiting for their approval. For a platform whose pitch is *continuous
monitoring*, that was the largest functional hole: monitoring nobody is told
about isn't monitoring.

Design rules:
  * Never raise into the caller. A notification failure must not fail an audit,
    a queue message, or an HTTP request — every entry point is wrapped.
  * Admin-configurable, per event, via `settings_store` so a deployment can
    switch classes of mail off without a redeploy.
  * Recipients come from the DB (org membership / audit requester), never from
    anything user-supplied in a payload.
"""
from __future__ import annotations
import logging

from sqlalchemy.orm import Session

from .. import models
from . import email as email_svc
from . import settings_store

log = logging.getLogger("govux.notify")

# event key -> default on/off. Regressions and approvals default ON because they
# need a human to act; per-audit completion mail is the noisiest, so it is opt-in
# for bulk/scheduled runs (see notify_audit_complete's `quiet` flag).
_EVENTS = {
    "notify_audit_complete": True,
    "notify_audit_failed": True,
    "notify_regression": True,
    "notify_scan_request": True,
}


def record(db: Session, user_id, kind: str, title: str,
           body: str | None = None, link: str | None = None) -> None:
    """Persist an in-app notification. Same contract as the mail path: never
    raise into the caller — a failed notification must not fail the audit that
    triggered it."""
    try:
        db.add(models.Notification(user_id=user_id, kind=kind, title=title,
                                   body=body, link=link))
        db.flush()
    except Exception as exc:               # pragma: no cover - defensive
        log.warning("could not record notification (%s): %r", kind, exc)


def _enabled(event: str) -> bool:
    if not settings_store.get_bool("notify_enabled", True):
        return False          # master switch
    return settings_store.get_bool(event, _EVENTS.get(event, True))


def _base_url() -> str:
    return settings_store.get_str("public_base_url", "http://localhost:3000").rstrip("/")


def _send(to: list[str], subject: str, body: str) -> int:
    """Best-effort fan-out. Returns how many were accepted by the provider."""
    sent = 0
    for addr in {a for a in to if a}:
        try:
            if email_svc.send(addr, subject, body):
                sent += 1
        except Exception as exc:                      # pragma: no cover - provider error
            log.warning("notification to %s failed: %r", addr, exc)
    return sent


def _org_admin_ids(db: Session, org_id) -> list:
    """Same people as _org_admins, by id — an in-app notification is addressed
    to a user row, not to a mailbox."""
    if not org_id:
        return []
    return [r[0] for r in db.query(models.User.id)
              .filter(models.User.org_id == org_id,
                      models.User.is_active.is_(True),
                      models.User.role.in_(("owner", "programme_admin", "super_admin")))
              .all()]


def _org_admins(db: Session, org_id) -> list[str]:
    """Owners and admins of an org — the people accountable for its domains."""
    if not org_id:
        return []
    rows = (db.query(models.User.email)
              .filter(models.User.org_id == org_id,
                      models.User.is_active.is_(True),
                      models.User.role.in_(("owner", "programme_admin", "super_admin")))
              .all())
    return [r[0] for r in rows]


# ---------- audit lifecycle -------------------------------------------------
def audit_completed(db: Session, audit: models.Audit, domain: models.Domain) -> int:
    """Tell whoever asked for this audit that it finished, and flag a regression
    to the org's admins if the score dropped materially."""
    try:
        sent = 0
        url = f"{_base_url()}/audits/{audit.id}/report"

        if audit.requested_by:
            # Recorded in-app whatever the mail settings say: the email is the
            # push, this is the record, and switching off a noisy class of mail
            # should not also erase the history of what happened.
            record(db, audit.requested_by, "audit_complete",
                   f"Audit complete: {domain.url}",
                   f"Scored {audit.overall_score} (Band {audit.band}) across "
                   f"{audit.pages_done} of {audit.pages_total} pages.",
                   f"/audits/{audit.id}/report")

        if _enabled("notify_audit_complete") and audit.requested_by:
            requester = db.get(models.User, audit.requested_by)
            if requester and requester.is_active:
                sent += _send(
                    [requester.email],
                    f"Audit complete: {domain.url} scored {audit.overall_score} (Band {audit.band})",
                    f"The GovUX audit of {domain.url} has finished.\n\n"
                    f"  GovUX Score : {audit.overall_score} (Band {audit.band})\n"
                    f"  Compliance  : {audit.compliance_status}\n"
                    f"  Pages       : {audit.pages_done} of {audit.pages_total}\n\n"
                    f"Full report: {url}\n")

        sent += _regression(db, audit, domain, url)
        return sent
    except Exception as exc:                          # never fail an audit over mail
        log.warning("audit_completed notification error: %r", exc)
        return 0


def _regression(db: Session, audit: models.Audit, domain: models.Domain, url: str) -> int:
    """Compare against this domain's previous completed audit. Mirrors the
    >=5-point threshold the /admin/alerts screen uses, so the mail and the
    dashboard never disagree about what counts as a regression."""
    if audit.overall_score is None:
        return 0
    previous = (db.query(models.Audit)
                  .filter(models.Audit.domain_id == domain.id,
                          models.Audit.id != audit.id,
                          models.Audit.status == "completed",
                          models.Audit.overall_score.isnot(None))
                  .order_by(models.Audit.created_at.desc()).first())
    if not previous:
        return 0
    drop = float(previous.overall_score) - float(audit.overall_score)
    if drop < 5:
        return 0

    # Recorded for every org admin regardless of the mail setting: a regression
    # is the event this platform exists to catch, and "we turned that email off"
    # is not a reason for it to leave no trace.
    for admin in _org_admin_ids(db, domain.org_id):
        record(db, admin, "regression",
               f"Score regression: {domain.url}",
               f"Down {drop:.0f} points to {audit.overall_score} (Band {audit.band}) "
               f"from {previous.overall_score}.",
               f"/audits/{audit.id}/compare")

    if not _enabled("notify_regression"):
        return 0
    return _send(
        _org_admins(db, domain.org_id),
        f"Score regression: {domain.url} dropped {drop:.0f} points",
        f"{domain.url} scored {audit.overall_score} (Band {audit.band}), down "
        f"{drop:.0f} points from {previous.overall_score} on its previous audit.\n\n"
        f"A drop this size usually follows an unreviewed content or template "
        f"change.\n\nCompare the two audits: {_base_url()}/audits/{audit.id}/compare\n"
        f"Full report: {url}\n")


def audit_failed(db: Session, audit: models.Audit, domain: models.Domain, error: str) -> int:
    """A scheduled audit that silently fails is indistinguishable from one that
    was never due — so the requester is told."""
    try:
        if not _enabled("notify_audit_failed") or not audit.requested_by:
            return 0
        requester = db.get(models.User, audit.requested_by)
        if not requester or not requester.is_active:
            return 0
        return _send(
            [requester.email],
            f"Audit failed: {domain.url}",
            f"The GovUX audit of {domain.url} could not be completed.\n\n"
            f"  Reason: {error[:300]}\n\n"
            f"You can start another audit from {_base_url()}/audits/new\n")
    except Exception as exc:
        log.warning("audit_failed notification error: %r", exc)
        return 0


# ---------- scan-request approvals ------------------------------------------
def scan_request_raised(db: Session, req: models.ScanRequest, domain: models.Domain,
                        requester: models.User) -> int:
    """A request sitting unseen in /admin/approvals blocks the requester
    indefinitely — the approvers need to know it arrived."""
    try:
        for admin in _org_admin_ids(db, domain.org_id):
            record(db, admin, "approval",
                   f"Approval needed: larger crawl for {domain.url}",
                   f"{requester.email} requested a {req.requested_pages}-page crawl.",
                   "/admin/approvals")
        if not _enabled("notify_scan_request"):
            return 0
        return _send(
            _org_admins(db, domain.org_id),
            f"Approval needed: larger crawl for {domain.url}",
            f"{requester.email} has requested a {req.requested_pages}-page crawl of "
            f"{domain.url}.\n\n"
            f"  Reason: {req.reason or '(none given)'}\n\n"
            f"Approve or decline: {_base_url()}/admin/approvals\n")
    except Exception as exc:
        log.warning("scan_request_raised notification error: %r", exc)
        return 0


def scan_request_decided(db: Session, req: models.ScanRequest, domain: models.Domain) -> int:
    try:
        if not req.user_id:
            return 0
        requester = db.get(models.User, req.user_id)
        if not requester or not requester.is_active:
            return 0
        verdict = "approved" if req.status == "approved" else "declined"
        record(db, requester.id, "approval",
               f"Crawl request {verdict}: {domain.url}",
               f"Your {req.requested_pages}-page crawl request was {verdict}.",
               "/audits/new")
        return _send(
            [requester.email],
            f"Your crawl request for {domain.url} was {verdict}",
            f"Your request for a {req.requested_pages}-page crawl of {domain.url} "
            f"was {verdict}.\n\n"
            + (f"Start the audit: {_base_url()}/audits/new\n" if req.status == "approved"
               else "Contact your organisation's admin if you need this reconsidered.\n"))
    except Exception as exc:
        log.warning("scan_request_decided notification error: %r", exc)
        return 0
