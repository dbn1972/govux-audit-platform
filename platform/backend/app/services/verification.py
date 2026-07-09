"""Real domain-ownership verification (gap: verify_domain was a stub).

Two mechanisms, mirroring how GSA / EU programmes prove estate ownership:
  * DNS TXT  — a `govux-verify=<token>` TXT record on the domain, and
  * metafile — the token served at /.well-known/govux-verify.txt

Both network calls are injected (`resolve_txt`, `fetch_text`) so the router is
testable offline and so the DNS/HTTP libraries stay optional at import time.
"""
from __future__ import annotations
from typing import Callable, Optional


def _default_resolve_txt(host: str) -> list[str]:  # pragma: no cover - needs network/dns
    import dns.resolver  # type: ignore
    answers = dns.resolver.resolve(host, "TXT")
    return [b"".join(r.strings).decode("utf-8", "ignore") if hasattr(r, "strings")
            else str(r).strip('"') for r in answers]


def _default_fetch_text(url: str) -> str:  # pragma: no cover - needs network
    import httpx
    r = httpx.get(url, timeout=10, follow_redirects=True)
    r.raise_for_status()
    return r.text


def check_dns_txt(host: str, token: str,
                  resolve_txt: Callable[[str], list[str]] = _default_resolve_txt) -> bool:
    """True if any TXT record on `host` contains the verification token."""
    want = token.strip()
    try:
        records = resolve_txt(host)
    except Exception:
        return False
    return any(want in (rec or "") for rec in records)


def check_metafile(host: str, token: str,
                   fetch_text: Callable[[str], str] = _default_fetch_text) -> bool:
    """True if https://host/.well-known/govux-verify.txt contains the token."""
    want = token.strip()
    url = f"https://{host}/.well-known/govux-verify.txt"
    try:
        body = fetch_text(url)
    except Exception:
        return False
    return want in (body or "")


def verify(host: str, token: str, method: str,
           resolve_txt: Optional[Callable[[str], list[str]]] = None,
           fetch_text: Optional[Callable[[str], str]] = None) -> bool:
    """Dispatch to the chosen method. `sso_mapping` is an org-trust path handled
    upstream (Parichay) and is treated as out-of-band success here."""
    if method == "dns_txt":
        return check_dns_txt(host, token, resolve_txt or _default_resolve_txt)
    if method == "file_upload":
        return check_metafile(host, token, fetch_text or _default_fetch_text)
    if method == "sso_mapping":
        return True
    return False
