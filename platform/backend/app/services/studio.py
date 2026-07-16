"""GovUX Studio — generation orchestration.

The LLM GENERATES pages; the deterministic `studio_audit` SCORES them; a
generate->audit->refine loop closes the gap to the target score. The LLM never
scores anything (invariant #1). Billable: token counts + INR cost per run.
"""
from __future__ import annotations
import json
import os
import re
from datetime import datetime, timezone

from . import settings_store, studio_audit

_PROMPT_FILE = os.path.join(os.path.dirname(__file__), "..", "prompts", "studio_generate.md")
_blocks_cache: dict | None = None


def _blocks() -> dict:
    global _blocks_cache
    if _blocks_cache is None:
        txt = open(_PROMPT_FILE, encoding="utf-8").read()

        def after(marker: str) -> str:
            i = txt.find(marker)
            m = re.search(r"```[a-z]*\n(.*?)```", txt[i:], re.S) if i >= 0 else None
            return m.group(1).strip() if m else ""
        _blocks_cache = {"system": after("## SYSTEM PROMPT"),
                         "generate": after("## GENERATE"), "refine": after("## REFINE")}
    return _blocks_cache


def _fill(template: str, values: dict) -> str:
    out = template
    for k, v in values.items():
        out = out.replace("{" + k + "}", str(v))
    return out


def _parse_pages(text: str) -> dict:
    """Extract the {filename: html} JSON object from the model output."""
    s, e = text.find("{"), text.rfind("}")
    if s < 0 or e <= s:
        raise ValueError("model did not return a JSON object of pages")
    pages = json.loads(text[s:e + 1])
    if not isinstance(pages, dict) or not pages:
        raise ValueError("empty or malformed pages object")
    return {str(k): str(v) for k, v in pages.items()}


# --- provider call (injectable for tests) -----------------------------------
def _call_anthropic(system: str, user: str) -> tuple[str, dict]:  # pragma: no cover - network
    import httpx
    key = settings_store.get_str("llm_api_key", "")
    model = settings_store.get_str("llm_model", "claude-haiku-4-5-20251001")
    r = httpx.post("https://api.anthropic.com/v1/messages",
                   headers={"x-api-key": key, "anthropic-version": "2023-06-01",
                            "content-type": "application/json"},
                   json={"model": model, "max_tokens": 8000, "system": system,
                         "messages": [{"role": "user", "content": user}]},
                   timeout=120)
    r.raise_for_status()
    data = r.json()
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    u = data.get("usage", {})
    return text, {"input": int(u.get("input_tokens", 0)), "output": int(u.get("output_tokens", 0))}


_caller = _call_anthropic


def generate(inputs: dict) -> tuple[dict, dict]:
    b = _blocks()
    text, usage = _caller(b["system"], _fill(b["generate"], inputs))
    return _parse_pages(text), usage


def refine(pages: dict, findings: list, inputs: dict) -> tuple[dict, dict]:
    b = _blocks()
    ctx = {**inputs, "score": inputs.get("_score", ""), "band": inputs.get("_band", ""),
           "findings": "\n".join(f"- {x}" for x in findings)}
    user = _fill(b["refine"], ctx) + "\n\nCurrent pages JSON:\n" + json.dumps(pages)
    text, usage = _caller(b["system"], user)
    return _parse_pages(text), usage


def sanitize(html: str) -> str:
    """Make a generated page self-contained + safe before preview/publish:
    drop external src/href, inline event handlers, and external scripts."""
    html = re.sub(r'\s(?:src|href)\s*=\s*["\']https?://[^"\']*["\']', ' data-removed="external"', html, flags=re.I)
    html = re.sub(r'\son\w+\s*=\s*["\'][^"\']*["\']', '', html, flags=re.I)
    html = re.sub(r'<script\b[^>]*\bsrc\s*=[^>]*>\s*</script>', '', html, flags=re.I)
    return html


def cost_inr(output_tokens: int) -> float:
    paise = settings_store.get_int("studio_cost_per_1k_output_inr", 120)
    return round(output_tokens / 1000.0 * paise / 100.0, 2)


def run(run_id, SessionLocal) -> None:
    """Execute one run: generate -> audit -> refine loop -> persist. Never raises."""
    from .. import models
    db = SessionLocal()
    run = db.get(models.StudioRun, run_id)
    if run is None:
        db.close(); return
    try:
        inputs = dict(run.inputs or {})
        target = settings_store.get_int("studio_target_score", 80)
        max_ref = settings_store.get_int("studio_max_refines", 4)

        pages, usage = generate(inputs)
        run.input_tokens += usage["input"]; run.output_tokens += usage["output"]
        result = studio_audit.score(pages)

        it = 0
        while result["overall"] < target and it < max_ref:
            pages, usage = refine(pages, result["findings"],
                                  {**inputs, "_score": result["overall"], "_band": result["band"]})
            run.input_tokens += usage["input"]; run.output_tokens += usage["output"]
            result = studio_audit.score(pages)
            it += 1

        run.pages = pages
        run.overall_score = result["overall"]; run.band = result["band"]
        run.findings = result["findings"]; run.iterations = it
        run.cost_inr = cost_inr(run.output_tokens)
        run.status = "scored"
    except Exception as exc:
        run.status = "failed"; run.error = str(exc)[:400]
    finally:
        run.finished_at = datetime.now(timezone.utc)
        db.commit(); db.close()
