"""Estate auto-discovery (gap G2).

The old bulk-scan 'auto_discover' only re-queried domains already registered in
our own DB. Real auto-discovery finds sites the estate owner never told us
about, the way the GSA programme enumerates ~26,000 federal .gov hosts. We do it
by parsing sitemaps, robots.txt and page HTML for `.gov.in` / `.nic.in` hosts.

Pure parsers (no network) so they are fully unit-testable; the network fetch is
injected at the router layer.
"""
from __future__ import annotations
import re
from urllib.parse import urlparse

GOV_RE = re.compile(r"(\.gov\.in|\.nic\.in)$", re.I)
# hosts embedded anywhere in text (sitemap/robots/html)
_HOST_RE = re.compile(r"https?://([a-z0-9.-]+\.(?:gov|nic)\.in)\b", re.I)
_LOC_RE = re.compile(r"<loc>\s*([^<\s]+)\s*</loc>", re.I)


def _host(u: str) -> str | None:
    u = u.strip()
    if not u:
        return None
    if "://" not in u:
        u = "https://" + u
    host = (urlparse(u).hostname or "").lower()
    return host if GOV_RE.search(host) else None


def parse_sitemap(xml: str) -> list[str]:
    """Extract gov hosts from a sitemap.xml (handles sitemap indexes too)."""
    hosts = set()
    for loc in _LOC_RE.findall(xml or ""):
        h = _host(loc)
        if h:
            hosts.add(h)
    return sorted(hosts)


def parse_robots(text: str) -> list[str]:
    """Pull Sitemap: directives and any gov hosts from a robots.txt."""
    hosts = set()
    for line in (text or "").splitlines():
        line = line.strip()
        if line.lower().startswith("sitemap:"):
            h = _host(line.split(":", 1)[1])
            if h:
                hosts.add(h)
    for h in _HOST_RE.findall(text or ""):
        hosts.add(h.lower())
    return sorted(hosts)


def extract_gov_domains(html: str) -> list[str]:
    """Every distinct .gov.in/.nic.in host linked from a page's HTML."""
    hosts = {h.lower() for h in _HOST_RE.findall(html or "")}
    return sorted(hosts)


def discover(seed: str, body: str, kind: str = "auto") -> list[str]:
    """Dispatch by content kind ('sitemap' | 'robots' | 'html' | 'auto')."""
    if kind == "sitemap" or (kind == "auto" and "<loc" in (body or "").lower()):
        return parse_sitemap(body)
    if kind == "robots" or (kind == "auto" and "sitemap:" in (body or "").lower()):
        return parse_robots(body)
    return extract_gov_domains(body)
