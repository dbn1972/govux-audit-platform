"""Chrome UX Report (CrUX) field data (gap G4).

Lab metrics (Lighthouse) don't reflect real citizens on low-end devices and slow
networks. When a CrUX API key is configured we blend real-user p75 metrics into
the performance category. The HTTP fetch is injected so this is testable offline
and degrades gracefully (returns None) when no field data exists for a URL.
"""
from __future__ import annotations
from typing import Callable, Optional

from ..config import settings

CRUX_ENDPOINT = "https://chromeuxreport.googleapis.com/v1/records:queryRecord"

# Core Web Vitals "good" thresholds (p75) -> used to convert field metrics to 0..100
_GOOD = {"largest_contentful_paint": 2500, "interaction_to_next_paint": 200,
         "cumulative_layout_shift": 0.10}
_POOR = {"largest_contentful_paint": 4000, "interaction_to_next_paint": 500,
         "cumulative_layout_shift": 0.25}


def _default_fetch(url: str, api_key: str) -> dict:  # pragma: no cover - needs network
    import httpx
    r = httpx.post(f"{CRUX_ENDPOINT}?key={api_key}",
                   json={"url": url, "formFactor": "PHONE"}, timeout=15)
    r.raise_for_status()
    return r.json()


def _metric_score(name: str, p75: float) -> float:
    good, poor = _GOOD[name], _POOR[name]
    if p75 <= good:
        return 100.0
    if p75 >= poor:
        return 0.0
    return round(100.0 * (poor - p75) / (poor - good), 1)


def parse_record(record: dict) -> Optional[dict]:
    """Turn a CrUX API response into {lcp_ms, inp_ms, cls, field_score} or None."""
    metrics = (record or {}).get("record", {}).get("metrics", {})
    if not metrics:
        return None
    out, parts = {}, []
    mapping = {"largest_contentful_paint": "lcp_ms",
               "interaction_to_next_paint": "inp_ms",
               "cumulative_layout_shift": "cls"}
    for crux_key, our_key in mapping.items():
        m = metrics.get(crux_key)
        if not m or "percentiles" not in m:
            continue
        p75 = float(m["percentiles"]["p75"])
        out[our_key] = round(p75, 3) if our_key == "cls" else int(p75)
        parts.append(_metric_score(crux_key, p75))
    if not parts:
        return None
    out["field_score"] = round(sum(parts) / len(parts), 1)
    return out


def fetch_field_data(url: str,
                     fetch: Callable[[str, str], dict] = _default_fetch) -> Optional[dict]:
    """Return blended field metrics for `url`, or None if unavailable/unconfigured."""
    api_key = getattr(settings, "crux_api_key", "") or ""
    if not api_key:
        return None
    try:
        record = fetch(url, api_key)
    except Exception:
        return None
    return parse_record(record)


def blend(lab_score: float, field: Optional[dict], lab_weight: float = 0.5) -> float:
    """Blend lab and field performance; falls back to lab-only when no field data."""
    if not field or "field_score" not in field:
        return round(lab_score, 1)
    return round(lab_weight * lab_score + (1 - lab_weight) * field["field_score"], 1)
