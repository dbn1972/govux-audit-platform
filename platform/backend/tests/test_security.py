import pytest
from app import security


@pytest.mark.parametrize("email,ok", [
    ("a.b@nic.in", True), ("x@dept.gov.in", True), ("X@DEPT.GOV.IN", True),
    ("a@gmail.com", False), ("a@gov.in.evil.com", False), ("a@nic.in.co", False),
])
def test_is_gov_email(email, ok):
    assert security.is_gov_email(email) is ok


def test_hash_and_verify_secret():
    h = security.hash_secret("123456")
    assert security.verify_secret("123456", h) is True
    assert security.verify_secret("000000", h) is False


def test_new_otp_is_six_digits():
    otp = security.new_otp()
    assert len(otp) == 6 and otp.isdigit()


def test_access_token_roundtrip():
    tok = security.issue_access_token("uid-1", "owner", "dev-1")
    claims = security.decode_access_token(tok)
    assert claims["sub"] == "uid-1"
    assert claims["role"] == "owner"
    assert claims["did"] == "dev-1"
    assert claims["typ"] == "access"


def test_refresh_token_unique():
    assert security.new_refresh_token() != security.new_refresh_token()


def test_device_proof_stub():
    assert security.verify_device_proof("pk", "chal", "sig") is True
    assert security.verify_device_proof("", "chal", "") is False
