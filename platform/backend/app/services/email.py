"""OTP / email delivery — provider chosen at runtime via admin config.

  console : print the OTP to the server log (dev default)
  smtp    : send via the configured SMTP relay (gov email gateway)
  api     : POST to an HTTP email API (e.g. a government notification service)

The provider and its credentials are admin-editable (settings_store), so the
email gateway can be switched without a redeploy.
"""
from __future__ import annotations
import logging

from ..config import settings
from . import settings_store

log = logging.getLogger("govux.email")


def _is_prod() -> bool:
    return getattr(settings, "env", "dev") == "production"


def send_otp(email: str, code: str) -> bool:
    provider = settings_store.get_str("email_provider", "console")
    frm = settings_store.get_str("email_from", "no-reply@govux.gov.in")
    subject = "Your GovUX sign-in code"
    body = f"Your GovUX one-time code is {code}. It expires in 5 minutes."
    try:
        if provider == "smtp":
            return _send_smtp(frm, email, subject, body)
        if provider == "api":
            return _send_api(email, subject, body)
        # console provider (dev): print the code. In production this leaks the sole
        # auth factor to logs (SAST-003) — refuse to print it and flag the misconfig.
        if _is_prod():
            log.error("email_provider=console in production — OTP NOT sent and NOT logged. "
                      "Configure smtp/api. (to=%s)", email)
            return False
        print(f"[OTP·console] to {email}: {code}")   # dev only
        return True
    except Exception as exc:
        log.error("email send error: %r", exc)
        return False


def send(to: str, subject: str, body: str) -> bool:
    """Generic dispatch for everything that ISN'T the OTP (invitations, audit
    notifications, ...). Unlike `send_otp` the body carries no auth factor, so
    the console provider may safely echo it in any environment."""
    provider = settings_store.get_str("email_provider", "console")
    frm = settings_store.get_str("email_from", "no-reply@govux.gov.in")
    try:
        if provider == "smtp":
            return _send_smtp(frm, to, subject, body)
        if provider == "api":
            return _send_api(to, subject, body)
        print(f"[email·console] to {to}: {subject}\n{body}")
        return True
    except Exception as exc:
        log.error("email send error: %r", exc)
        return False


def send_test(to: str) -> dict:
    """Send a test message via the currently-configured provider — lets an admin
    validate the email config before relying on it for OTPs."""
    provider = settings_store.get_str("email_provider", "console")
    frm = settings_store.get_str("email_from", "no-reply@govux.gov.in")
    subject = "GovUX — test email"
    body = "This is a test email confirming your GovUX email configuration works."
    try:
        if provider == "smtp":
            ok = _send_smtp(frm, to, subject, body)
        elif provider == "api":
            ok = _send_api(to, subject, body)
        else:
            print(f"[test-email·console] to {to}")
            ok = True
        return {"ok": ok, "provider": provider}
    except Exception as exc:
        return {"ok": False, "provider": provider, "error": str(exc)[:200]}


def _send_smtp(frm, to, subject, body) -> bool:  # pragma: no cover - needs a relay
    import smtplib
    from email.mime.text import MIMEText
    host = settings_store.get_str("smtp_host")
    port = settings_store.get_int("smtp_port", 587)
    user = settings_store.get_str("smtp_user")
    pw = settings_store.get_str("smtp_password")
    if not host:
        # never echo the body (it contains the OTP). Dev gets the code to unblock
        # local testing; production only gets a redacted marker.
        if _is_prod():
            log.error("SMTP selected but smtp_host unset — OTP NOT sent (to=%s)", to)
        else:
            print(f"[OTP·smtp-unconfigured] to {to}: {body}")
        return False
    msg = MIMEText(body); msg["Subject"] = subject; msg["From"] = frm; msg["To"] = to
    with smtplib.SMTP(host, port, timeout=15) as s:
        s.starttls()
        if user:
            s.login(user, pw)
        s.sendmail(frm, [to], msg.as_string())
    return True


def _send_api(to, subject, body) -> bool:  # pragma: no cover - needs a provider
    import httpx
    url = settings_store.get_str("smtp_host")   # reuse host field as API endpoint
    key = settings_store.get_str("smtp_password")
    if not url:
        return False
    httpx.post(url, json={"to": to, "subject": subject, "body": body},
               headers={"Authorization": f"Bearer {key}"}, timeout=15)
    return True
