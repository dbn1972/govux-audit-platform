"""Advisory LLM enrichment of remediation guidance (gap G5, opt-in).

STRICTLY advisory and OUTSIDE the score path (domain rule #1). It only turns the
deterministic remediation into plain-language, step-by-step "how to fix" guidance
for a non-technical government officer. It NEVER changes any finding, score, band
or verdict.

- Disabled by default. Enabled per-instance by a `super_admin` in Admin →
  Configuration (`llm_enabled` + `llm_api_key`).
- Any failure (disabled, no key, network/API error, timeout) degrades to `None`,
  so the deterministic guidance always stands.
- Output is labelled advisory in the UI and is never persisted into the score.
"""
from __future__ import annotations
import logging

from . import settings_store

log = logging.getLogger("govux.llm")
_TIMEOUT = 20

_PROMPT = (
    "You advise Indian government website teams. In 2–4 short, plain-language steps, "
    "tell a non-technical officer how to get this issue fixed. No jargon, no preamble, "
    "no markdown headings. Context: Indian government (GIGW 3.0 / WCAG 2.2 AA / DPDP Act).\n\n"
    "Issue: {title}\nGuideline: {guideline}\nBaseline fix: {base}\nTechnical hint: {hint}"
)


def is_enabled() -> bool:
    """On only when an admin has turned it on AND supplied an API key."""
    return bool(settings_store.get_bool("llm_enabled", False)) and \
        bool(settings_store.get_str("llm_api_key", ""))


def _call_anthropic(model: str, key: str, prompt: str) -> str:  # pragma: no cover - network
    import httpx
    r = httpx.post(
        "https://api.anthropic.com/v1/messages",
        headers={"x-api-key": key, "anthropic-version": "2023-06-01",
                 "content-type": "application/json"},
        json={"model": model, "max_tokens": 300,
              "messages": [{"role": "user", "content": prompt}]},
        timeout=_TIMEOUT)
    r.raise_for_status()
    blocks = r.json().get("content", [])
    return "".join(b.get("text", "") for b in blocks if b.get("type") == "text").strip()


# indirection so tests can inject a caller without hitting the network
_caller = _call_anthropic


def enrich(finding: dict, base: str, hint: str) -> str | None:
    """Plain-language 'how to fix' for one finding, or None if unavailable.
    Never raises — the deterministic guidance is the guaranteed fallback."""
    if not is_enabled():
        return None
    try:
        prompt = _PROMPT.format(title=finding.get("title", ""),
                                guideline=finding.get("guideline", ""),
                                base=base or "", hint=hint or "")
        model = settings_store.get_str("llm_model", "claude-haiku-4-5-20251001")
        key = settings_store.get_str("llm_api_key", "")
        text = _caller(model, key, prompt)
        return text or None
    except Exception as exc:  # never let advisory AI break the endpoint
        log.warning("llm remediation enrich failed: %r", exc)
        return None
