"""Regression tests for the Phase-0/1 SAST fixes:
  SAST-001 production boot rejects a default JWT secret
  SAST-003 OTP is never written to logs in production
  SAST-006 /metrics requires a token in production
"""
import pathlib

import pytest

from app.config import settings
from app.services.secretbox import assert_production_key
from app.services import email


# ── SAST-001 ────────────────────────────────────────────────────────────────
def test_prod_rejects_default_jwt_secret(monkeypatch):
    monkeypatch.setattr(settings, "env", "production")
    monkeypatch.setattr(settings, "jwt_secret", "change-me-in-prod")
    monkeypatch.setattr(settings, "secret_key", "a-distinct-master-key")
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        assert_production_key()


def test_prod_rejects_missing_master_key(monkeypatch):
    monkeypatch.setattr(settings, "env", "production")
    monkeypatch.setattr(settings, "jwt_secret", "a-strong-unique-jwt-secret")
    monkeypatch.setattr(settings, "secret_key", "")
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        assert_production_key()


def test_prod_accepts_strong_distinct_secrets(monkeypatch):
    monkeypatch.setattr(settings, "env", "production")
    monkeypatch.setattr(settings, "jwt_secret", "a-strong-unique-jwt-secret")
    monkeypatch.setattr(settings, "secret_key", "a-distinct-master-key")
    assert_production_key()          # must not raise


def test_dev_skips_the_assertion(monkeypatch):
    monkeypatch.setattr(settings, "env", "dev")
    assert_production_key()          # defaults are fine in dev


# ── SAST-003 ────────────────────────────────────────────────────────────────
def test_otp_not_logged_in_production(monkeypatch, capsys):
    # GOVUX_ALLOW_CONSOLE_OTP disables this very guard, and it is set in the
    # dev container's environment — without clearing it the test silently
    # asserted the opposite of its name and went green wherever the flag was
    # absent. A guard test that inverts with ambient env is worse than none.
    monkeypatch.delenv("GOVUX_ALLOW_CONSOLE_OTP", raising=False)
    monkeypatch.setattr(email.settings, "env", "production")   # provider defaults to console
    ok = email.send_otp("officer@nic.in", "424242")
    out = capsys.readouterr().out
    assert ok is False                       # console provider refused in prod
    assert "424242" not in out               # the code must never hit stdout


def test_otp_printed_in_dev(monkeypatch, capsys):
    monkeypatch.setattr(email.settings, "env", "dev")
    ok = email.send_otp("officer@nic.in", "313131")
    out = capsys.readouterr().out
    assert ok is True and "313131" in out    # dev convenience preserved


def test_otp_logged_in_production_with_allow_env(monkeypatch, capsys):
    monkeypatch.setenv("GOVUX_ALLOW_CONSOLE_OTP", "true")
    monkeypatch.setattr(email.settings, "env", "production")
    ok = email.send_otp("officer@nic.in", "777777")
    out = capsys.readouterr().out
    assert ok is True and "777777" in out


def test_prod_compose_does_not_set_the_console_otp_escape_hatch():
    """It was set for months while there was no working mail path, and every
    guard in this file is a no-op while it is: it turns _is_prod() off, which
    re-opens the log printing AND the sandbox-account bypass. Removing it is
    only worth anything if it cannot drift back in unnoticed."""
    compose = pathlib.Path(__file__).resolve().parents[2] / "docker-compose.prod.yml"
    if not compose.exists():                      # not shipped in every checkout
        pytest.skip(f"{compose.name} not present")
    live = [ln for ln in compose.read_text().splitlines()
            if "GOVUX_ALLOW_CONSOLE_OTP" in ln and not ln.lstrip().startswith("#")]
    assert live == [], f"console-OTP escape hatch is back in production: {live}"


def test_otp_response_never_carries_the_code_in_production(client, monkeypatch):
    """The request body used to echo the code whenever GOVUX_ALLOW_CONSOLE_OTP
    was set — which the production compose file sets. That handed a working
    sign-in for any .gov.in address to anyone who could POST this endpoint, with
    no access to the logs at all. The flag governs the log line, nothing else."""
    monkeypatch.setenv("GOVUX_ALLOW_CONSOLE_OTP", "true")
    monkeypatch.setattr(settings, "env", "production")
    r = client.post("/v1/auth/otp/request", json={"email": "n.officer@nic.in"})
    assert r.status_code == 202 and "dev_otp" not in r.json()


# ── sandbox fixtures ────────────────────────────────────────────────────────
# gov.in is a live namespace and owner@gov.in is our fixture, not our mailbox.
# Once a real relay was configured, every sign-in as a fixture posted a working
# one-time code to somebody else's mail server, and QA — who cannot read that
# mailbox — could not sign in at all.

def _relay_spy(monkeypatch):
    """Configure the smtp provider and record what reaches the relay."""
    sent = []
    monkeypatch.setattr(email.settings_store, "get_str",
                        lambda k, fallback=None: "smtp" if k == "email_provider" else "x")
    monkeypatch.setattr(email, "_send_smtp",
                        lambda *a: (sent.append(a), True)[1])
    return sent


def test_sandbox_otp_is_logged_never_mailed(monkeypatch, capsys):
    sent = _relay_spy(monkeypatch)
    monkeypatch.setattr(email.settings, "env", "dev")
    ok = email.send_otp("owner@gov.in", "112233")
    assert ok is True and "112233" in capsys.readouterr().out
    assert sent == [], "a fixture's code must not reach the relay"


def test_a_real_address_still_goes_to_the_relay(monkeypatch, capsys):
    """The bypass is per-account, not a blanket 'stop sending mail in dev'."""
    sent = _relay_spy(monkeypatch)
    monkeypatch.setattr(email.settings, "env", "dev")
    ok = email.send_otp("officer@nic.in", "445566")
    assert ok is True and "445566" not in capsys.readouterr().out
    assert len(sent) == 1


def test_sandbox_bypass_is_off_in_production(monkeypatch, capsys):
    # If the fixtures ever exist on a production database, printing their codes
    # hands a super_admin session to anyone who can read the logs.
    monkeypatch.delenv("GOVUX_ALLOW_CONSOLE_OTP", raising=False)
    sent = _relay_spy(monkeypatch)
    monkeypatch.setattr(email.settings, "env", "production")
    email.send_otp("super_admin@gov.in", "778899")
    assert "778899" not in capsys.readouterr().out
    assert len(sent) == 1


# ── SAST-006 ────────────────────────────────────────────────────────────────
def test_metrics_requires_token_in_production(client, monkeypatch):
    monkeypatch.setattr(settings, "env", "production")
    assert client.get("/metrics").status_code == 401    # no token set => refused in prod


def test_metrics_open_in_dev(client, monkeypatch):
    monkeypatch.setattr(settings, "env", "dev")
    assert client.get("/metrics").status_code == 200    # open in dev (unchanged)
