"""Privacy-notice / terms assessment against the Digital Personal Data
Protection Act, 2023 (DPDP).

The engine already checks that a privacy-policy *link exists* (a GIGW element).
This goes further: it reads the policy + terms text and tests whether the notice
addresses the DPDP obligations a Data Fiduciary owes citizens. Deterministic
keyword/phrase detection — advisory, and (like accessibility) capped at
'automated' confidence: a legal reviewer confirms. `assess` is pure and tested;
the page fetch is injected.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Callable

# (key, obligation, detection phrases, severity, statutory basis)
REQUIREMENTS: list[tuple[str, str, tuple[str, ...], str, str]] = [
    ("notice", "Itemised notice of personal data collected and the purpose",
     ("purpose", "personal data", "information we collect", "data we collect", "categories of"),
     "high", "DPDP s.5 — an itemised notice of the personal data and the purpose of processing."),
    ("consent", "Consent as the basis of processing",
     ("consent",), "high", "DPDP s.6 — free, specific, informed, unambiguous consent by clear affirmative action."),
    ("withdraw", "Right to withdraw consent, as easily as it was given",
     ("withdraw", "revoke"), "high", "DPDP s.6(4)-(6) — withdrawal must be as easy as giving consent."),
    ("rights", "Data-principal rights: access, correction and erasure",
     ("right to", "correction", "erasure", "rectification", "access your", "delete your"),
     "high", "DPDP ss.11-13 — rights to access, correction and erasure of personal data."),
    ("grievance", "Grievance redressal mechanism / Grievance Officer",
     ("grievance",), "high", "DPDP s.13 — a readily available grievance redressal mechanism."),
    ("officer", "Published contact of the Data Protection Officer / fiduciary",
     ("data protection officer", "dpo", "grievance officer"), "medium",
     "DPDP s.8(9)/s.10 — the DPO/fiduciary contact must be published."),
    ("retention", "Data retention and erasure-when-served policy",
     ("retention", "retain", "how long", "no longer required"), "medium",
     "DPDP s.8(7) — erase personal data once the purpose is served."),
    ("children", "Children's data — verifiable parental consent (under 18)",
     ("child", "children", "minor", "parental", "guardian", "under 18", "age of eighteen"),
     "high", "DPDP s.9 — verifiable parental consent for under-18s; no tracking/targeted advertising."),
    ("board", "Right to complain to the Data Protection Board of India",
     ("data protection board", "the board"), "medium",
     "DPDP — data principals may escalate to the Data Protection Board."),
    ("security", "Reasonable security safeguards",
     ("security", "safeguard", "encrypt", "protect"), "medium",
     "DPDP s.8(5) — reasonable security safeguards to prevent a personal-data breach."),
    ("sharing", "Disclosure of third-party sharing / processors",
     ("third party", "third-party", "shared with", "disclos", "processor"), "medium",
     "DPDP — sharing with processors/other fiduciaries must be disclosed and consented."),
    ("dpdp_ref", "Alignment with the DPDP Act 2023 (not only IT Act 2000)",
     ("digital personal data protection", "dpdp", " 2023"), "medium",
     "A post-2023 notice should reference the DPDP Act, not only the IT Act 2000 / SPDI Rules 2011."),
]


@dataclass
class DpdpResult:
    score: float
    status: str                # aligned | partially_aligned | not_aligned
    present: list[str]
    findings: list[dict]
    total: int


def assess(privacy_text: str, terms_text: str = "") -> DpdpResult:
    text = f"{privacy_text or ''} {terms_text or ''}".lower()
    present, findings = [], []
    for key, title, phrases, sev, basis in REQUIREMENTS:
        if any(p in text for p in phrases):
            present.append(key)
        else:
            findings.append({
                "category": "trust", "severity": sev, "guideline": "DPDP-2023",
                "title": f"Privacy notice does not clearly address: {title}",
                "effort": "medium", "basis": basis, "confidence": "automated",
            })
    total = len(REQUIREMENTS)
    score = round(len(present) / total * 100, 1)
    status = "aligned" if score >= 85 else "partially_aligned" if score >= 50 else "not_aligned"
    return DpdpResult(score, status, present, findings, total)


def _default_fetch(url: str) -> str:  # pragma: no cover - network
    import httpx
    r = httpx.get(url, timeout=20, follow_redirects=True,
                  headers={"User-Agent": "Mozilla/5.0 (GovUX audit)"})
    r.raise_for_status()
    return r.text


def assess_urls(privacy_url: str, terms_url: str = "",
                fetch: Callable[[str], str] = _default_fetch) -> DpdpResult:
    """Fetch policy/terms and assess. (Prefer rendered text for JS-heavy sites.)"""
    p = fetch(privacy_url) if privacy_url else ""
    t = fetch(terms_url) if terms_url else ""
    return assess(p, t)
