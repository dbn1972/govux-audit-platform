"""Runtime admin configuration — settings store + admin API + live effect."""
import uuid
from app import models, security
from app.services import settings_store, email


# ---------- settings store ----------
def test_store_defaults_and_override(db):
    # default when no override
    assert settings_store.get_int("scan_ip_limit", 3) == 3
    assert settings_store.get_bool("captcha_enabled", True) is True
    # set an override -> live
    settings_store.set_value("scan_ip_limit", 7, db)
    assert settings_store.get_int("scan_ip_limit", 3) == 7
    settings_store.set_value("captcha_enabled", False, db)
    assert settings_store.get_bool("captcha_enabled", True) is False


def test_store_rejects_unknown_key(db):
    import pytest
    with pytest.raises(KeyError):
        settings_store.set_value("not_a_setting", 1, db)


def test_email_console_default():
    assert email.send_otp("x@nic.in", "123456") is True   # console provider = no error


def test_secret_stored_encrypted_and_decrypts(db):
    from app import models
    from app.services import secretbox
    settings_store.set_value("captcha_secret", "super-secret-key", db)
    # raw DB value is ciphertext, not the plaintext
    row = db.get(models.AppSetting, "captcha_secret")
    assert row.value.startswith("enc:") and "super-secret-key" not in row.value
    # but the app reads it back in the clear
    assert settings_store.get_str("captcha_secret", "") == "super-secret-key"
    # round-trip at the primitive level
    assert secretbox.decrypt(secretbox.encrypt("hello")) == "hello"
    assert secretbox.decrypt("plain-legacy") == "plain-legacy"


def test_test_email_endpoint(client, ctx):
    r = client.post("/v1/admin/config/test-email", headers=ctx["headers"], json={"to": "a@nic.in"})
    assert r.status_code == 200 and r.json()["ok"] is True and r.json()["provider"] == "console"


# ---------- admin API ----------
def _owner_hdr(db):
    org = models.Organisation(name="O", org_type="department"); db.add(org); db.flush()
    u = models.User(email=f"o.{uuid.uuid4().hex[:6]}@nic.in", org_id=org.id, role="owner")
    db.add(u); db.flush()
    dev = models.Device(user_id=u.id, device_pubkey="pk"); db.add(dev); db.commit()
    return {"Authorization": f"Bearer {security.issue_access_token(str(u.id), 'owner', str(dev.id))}"}


def test_config_requires_admin(client, db):
    assert client.get("/v1/admin/config", headers=_owner_hdr(db)).status_code == 403


def test_config_get_masks_secrets(client, ctx):
    r = client.get("/v1/admin/config", headers=ctx["headers"])
    assert r.status_code == 200
    flat = [s for c in r.json()["categories"] for s in c["settings"]]
    keys = {s["key"] for s in flat}
    assert "scan_ip_limit" in keys and "captcha_secret" in keys
    secret = next(s for s in flat if s["key"] == "captcha_secret")
    assert secret["secret"] is True   # never leaks the raw value


def test_config_patch_takes_effect(client, ctx):
    # tighten the free-scan quota to 1 via the admin API...
    r = client.patch("/v1/admin/config", headers=ctx["headers"],
                     json={"updates": {"scan_ip_limit": 1}})
    assert r.status_code == 200 and "scan_ip_limit" in r.json()["applied"]
    # ...and the public scanner now enforces it: 1 free, then CAPTCHA
    assert client.post("/v1/public/scan", json={"url": "a.gov.in"}).status_code == 202
    blocked = client.post("/v1/public/scan", json={"url": "a.gov.in"})
    assert blocked.status_code == 429 and blocked.json()["detail"]["captcha_required"] is True


def test_config_patch_rejects_bad_type_and_unknown(client, ctx):
    r = client.patch("/v1/admin/config", headers=ctx["headers"],
                     json={"updates": {"scan_ip_limit": "abc", "bogus": 1}})
    assert "scan_ip_limit" in r.json()["rejected"] and "bogus" in r.json()["rejected"]
