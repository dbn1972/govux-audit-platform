"""Pre-scan URL validation + SSRF guard.

Runs BEFORE a scan is queued. Checks the URL is well-formed and http(s), is a
.gov.in/.nic.in domain (not a raw IP), resolves, and — critically — does NOT
resolve to a private / loopback / link-local / reserved address (SSRF: stop the
scanner being pointed at internal services or the cloud metadata endpoint).

The DNS resolver is looked up at call time (`_resolve`) so it can be stubbed in
tests where domains are fictitious.
"""
from __future__ import annotations
import ipaddress
import re
import socket
from urllib.parse import urlparse, urljoin

GOV_RE = re.compile(r"(\.gov\.in|\.nic\.in)$", re.I)


def _default_resolve(host: str) -> list[str]:  # pragma: no cover - real DNS
    return list({info[4][0] for info in socket.getaddrinfo(host, None)})


def _resolve(host: str) -> list[str]:
    return _default_resolve(host)


def validate(url: str, gov_only: bool = True) -> dict:
    """Return {ok, url, host} on success, or {ok: False, error} with a friendly message."""
    u = (url or "").strip()
    if not u:
        return {"ok": False, "error": "Please enter a website address."}
    if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", u):
        u = "https://" + u
    # urlparse raises ValueError on some malformed inputs (e.g. an unclosed IPv6
    # bracket "http://[::1") — never let that become a 500; reject cleanly.
    try:
        p = urlparse(u)
        scheme = p.scheme.lower()
        host = (p.hostname or "").lower()
    except ValueError:
        return {"ok": False, "error": "That doesn't look like a valid website address."}
    if scheme not in ("http", "https"):
        return {"ok": False, "error": "Only http and https addresses can be scanned."}
    if not host or "." not in host:
        return {"ok": False, "error": "That doesn't look like a valid website address."}

    # raw IPs are not accepted (must be a domain — and blocks direct-to-internal-IP)
    try:
        ipaddress.ip_address(host)
        return {"ok": False, "error": "Enter a domain name (e.g. example.gov.in), not an IP address."}
    except ValueError:
        pass

    if gov_only and not GOV_RE.search(host):
        return {"ok": False, "error": "Only .gov.in and .nic.in websites can be scanned."}

    # must resolve, and must NOT point at an internal / reserved address (SSRF guard)
    try:
        addrs = _resolve(host)
    except Exception:
        addrs = []
    if not addrs:
        return {"ok": False, "error": "This domain could not be found — please check the spelling."}
    for a in addrs:
        try:
            ip = ipaddress.ip_address(a)
        except ValueError:
            continue
        if (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved
                or ip.is_multicast or ip.is_unspecified):
            return {"ok": False, "error": "This address resolves to an internal network and cannot be scanned."}

    return {"ok": True, "url": u, "host": host}


class SSRFError(ValueError):
    """Raised when a fetch target fails the SSRF guard."""


def guarded_get(url: str, *, timeout: float = 20.0, max_redirects: int = 3,
                max_bytes: int = 25 * 1024 * 1024) -> bytes:
    """SSRF-safe server-side GET for engine-discovered resources (PDFs, docs).

    Validates the target on EVERY hop (not once at submit time) — blocks non-http(s)
    schemes, raw-IP and internal/loopback/link-local/reserved resolutions, follows
    redirects manually (validating each Location), and caps the download size.

    NOTE: DNS rebinding between validate() and the actual connect is a residual
    risk; the durable mitigation is a network egress policy that denies RFC1918 /
    link-local from the worker. This closes the application-layer vector.
    """
    import httpx

    current = url
    for _ in range(max_redirects + 1):
        v = validate(current, gov_only=False)   # public host only, never internal IPs
        if not v["ok"]:
            raise SSRFError(v["error"])
        with httpx.stream("GET", v["url"], timeout=timeout, follow_redirects=False) as r:
            if r.is_redirect and r.headers.get("location"):
                current = urljoin(v["url"], r.headers["location"])
                continue
            r.raise_for_status()
            buf = bytearray()
            for chunk in r.iter_bytes():
                buf += chunk
                if len(buf) > max_bytes:
                    raise SSRFError("Remote document exceeds the size limit.")
            return bytes(buf)
    raise SSRFError("Too many redirects.")
