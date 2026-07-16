"""GovUX Studio — deterministic static auditor.

Scores generated HTML against the same 8 weighted categories as the live engine,
WITHOUT a browser, so the generate->audit->refine loop is fast and reproducible.
It is a static approximation (the full Playwright/axe/Lighthouse audit still runs
once the prototype is deployed to a URL) but it is deterministic and LLM-free —
it is the sole arbiter of the >=80 target, exactly like the real score path.
"""
from __future__ import annotations
import re

# same weights as services/scoring.py (sum = 100)
WEIGHTS = {"accessibility": 22, "usability": 17, "gigw": 15, "performance": 12,
           "design": 11, "responsiveness": 10, "content": 7, "trust": 6}
BANDS = [(90, "A"), (75, "B"), (60, "C"), (40, "D"), (0, "E")]

_GIGW_FOOTER = ["privacy", "terms", "sitemap", "rti", "contact",
                "copyright", "accessibility", "feedback", "help"]
_OVERLAYS = ["accessibe", "acsb", "userway", "equalweb", "audioeye", "adally", "maxaccess"]
_TRACKERS = ["_ga", "gtag(", "google-analytics", "googletagmanager", "_fbq", "fbevents"]


def _pct(part: int, whole: int) -> float:
    return 100.0 if whole == 0 else round(100.0 * part / whole, 1)


def _score_page(html: str, is_home: bool) -> tuple[dict, list]:
    h = html.lower()
    F: list[str] = []           # findings for this page
    imgs = re.findall(r"<img\b[^>]*>", h)
    imgs_alt = [t for t in imgs if re.search(r'\balt\s*=', t)]
    inputs = re.findall(r"<(?:input|select|textarea)\b[^>]*>", h)
    inputs_ok = [t for t in inputs
                 if re.search(r'\baria-label\s*=', t) or re.search(r'\bid\s*=\s*["\']([^"\']+)', t)
                 and re.search(r'<label\b[^>]*\bfor\s*=', h)]
    h1s = re.findall(r"<h1\b", h)

    # --- accessibility (22) ---
    a = 0.0
    a += 18 if re.search(r'<html[^>]*\blang\s*=', h) else 0
    a += 16 if len(h1s) == 1 else (6 if h1s else 0)
    a += 0.16 * _pct(len(imgs_alt), len(imgs))          # 0..16
    a += 0.14 * _pct(len(inputs_ok), len(inputs))       # 0..14
    a += 12 if ("skip to main" in h or 'href="#main"' in h or "skip to content" in h) else 0
    a += 8 if (":focus" in h) else 0
    a += 8 if not re.search(r'tabindex\s*=\s*["\']?[1-9]', h) else 0   # no positive tabindex
    a += 8 if ("aria-" in h or "<nav" in h) else 0
    if not re.search(r'<html[^>]*\blang', h): F.append("accessibility: set <html lang>")
    if len(h1s) != 1: F.append(f"accessibility: page must have exactly one <h1> (has {len(h1s)})")
    if len(imgs_alt) < len(imgs): F.append("accessibility: every <img> needs alt text")
    if len(inputs_ok) < len(inputs): F.append("accessibility: every form control needs an associated <label>")
    if "skip to main" not in h and 'href="#main"' not in h and "skip to content" not in h:
        F.append("accessibility: add a 'skip to main content' link")

    # --- gigw (15): masthead + mandatory footer + last-updated + search ---
    footer_hits = sum(1 for k in _GIGW_FOOTER if k in h)
    g = 0.0
    g += 22 if ("government of india" in h or "भारत सरकार" in html) else 0
    g += 0.5 * _pct(footer_hits, len(_GIGW_FOOTER))     # 0..50
    g += 14 if ("last updated" in h or "last reviewed" in h) else 0
    g += 14 if ("<input" in h and "search" in h) else 0
    if "government of india" not in h and "भारत सरकार" not in html:
        F.append("gigw: add the Government of India masthead")
    missing = [k for k in _GIGW_FOOTER if k not in h]
    if missing: F.append("gigw: add mandatory footer links: " + ", ".join(missing))
    if "last updated" not in h and "last reviewed" not in h: F.append("gigw: show a 'Last Updated' date")

    # --- usability (17) ---
    u = 0.0
    u += 34 if "<nav" in h else 0
    u += 22 if not ("click here" in h or "read more</a>" in h) else 0
    u += 22 if re.search(r'<(?:a|button)[^>]*class="[^"]*(btn|button)', h) else 22 if "<button" in h else 0
    u += 22 if (not is_home and "breadcrumb" in h) or is_home else 0
    if "click here" in h: F.append("usability: replace 'click here' with descriptive link text")

    # --- design / UX4G (11) ---
    d = 0.0
    d += 45 if ("#4a2bc2" in h or "--ux4g" in h) else 0        # UX4G brand token
    d += 25 if "<style" in h else 0
    d += 15 if ("noto sans" in h or "schibsted" in h) else 0
    d += 15 if re.search(r'font-size\s*:\s*1[6-9]px|font-size\s*:\s*1(\.\d+)?rem', h) else 0
    if "#4a2bc2" not in h and "--ux4g" not in h: F.append("design: use the UX4G brand token #4a2bc2")

    # --- performance (12): self-contained ---
    ext = len(re.findall(r'(?:src|href)\s*=\s*["\']https?://', h)) + \
        len(re.findall(r'@import\s+url\(', h))
    p = max(0.0, 100.0 - 20 * ext)
    if ext: F.append(f"performance: {ext} external reference(s) — inline assets for a self-contained page")

    # --- responsiveness (10) ---
    r = 0.0
    r += 40 if 'name="viewport"' in h else 0
    r += 30 if ("max-width" in h or "flex" in h or "grid" in h) else 0
    r += 30 if not re.search(r'width\s*:\s*\d{4,}px', h) else 0     # no >=1000px fixed widths
    if 'name="viewport"' not in h: F.append("responsiveness: add a viewport meta tag")

    # --- content (7) ---
    text = re.sub(r"<[^>]+>", " ", html)
    words = len(text.split())
    headings = len(re.findall(r"<h[1-4]\b", h))
    c = min(100.0, (words / 6.0)) * 0.6 + min(100.0, headings * 20) * 0.4
    if words < 120: F.append("content: add substantive plain-language content")

    # --- trust (6) ---
    t = 100.0
    if any(s in h for s in _OVERLAYS): t -= 60; F.append("trust: remove the accessibility overlay widget")
    if any(s in h for s in _TRACKERS): t -= 40; F.append("trust: remove third-party tracking/analytics")

    cats = {"accessibility": min(100, a), "gigw": min(100, g), "usability": min(100, u),
            "design": min(100, d), "performance": min(100, p), "responsiveness": min(100, r),
            "content": min(100, c), "trust": max(0, t)}
    return cats, F


def score(pages: dict[str, str]) -> dict:
    """Score a {filename: html} set. Returns overall, band, per-category and findings."""
    if not pages:
        return {"overall": 0, "band": "E", "categories": {}, "findings": ["no pages generated"]}
    per_cat: dict[str, list] = {k: [] for k in WEIGHTS}
    findings: list[str] = []
    home = next((f for f in pages if "index" in f.lower()), list(pages)[0])
    for fname, html in pages.items():
        cats, F = _score_page(html or "", fname == home)
        for k, v in cats.items():
            per_cat[k].append(v)
        findings += [f"{fname}: {x}" for x in F]
    categories = {k: round(sum(v) / len(v), 1) for k, v in per_cat.items()}
    overall = round(sum(categories[k] * WEIGHTS[k] for k in WEIGHTS) / 100.0, 1)
    band = next(b for cut, b in BANDS if overall >= cut)
    # de-dup findings, keep order, cap
    seen, uniq = set(), []
    for x in findings:
        key = x.split(": ", 1)[-1]
        if key not in seen:
            seen.add(key); uniq.append(x)
    return {"overall": overall, "band": band, "categories": categories, "findings": uniq[:40]}
