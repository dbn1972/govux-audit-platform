"""Regression tests for the Phase-0/1 SAST fixes:
  SAST-001 production boot rejects a default JWT secret
  SAST-003 OTP is never written to logs in production
  SAST-006 /metrics requires a token in production
"""
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


# ── SAST-006 ────────────────────────────────────────────────────────────────
def test_metrics_requires_token_in_production(client, monkeypatch):
    monkeypatch.setattr(settings, "env", "production")
    assert client.get("/metrics").status_code == 401    # no token set => refused in prod


def test_metrics_open_in_dev(client, monkeypatch):
    monkeypatch.setattr(settings, "env", "dev")
    assert client.get("/metrics").status_code == 200    # open in dev (unchanged)
