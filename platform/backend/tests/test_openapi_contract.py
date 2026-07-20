"""API contract snapshot — guards the public HTTP surface against silent drift.

Every route + its declared response codes are frozen into `openapi_contract.json`.
A removed endpoint, a renamed path, or a changed status set fails this test, so a
breaking change to a client-facing contract can never merge unnoticed. When a
change is *intentional*, regenerate the snapshot:

    UPDATE_CONTRACT=1 pytest tests/test_openapi_contract.py

and commit the updated JSON alongside the code that changed the surface.
"""
import json
import os
from pathlib import Path

from app.main import app

SNAPSHOT = Path(__file__).parent / "openapi_contract.json"


def _surface() -> dict:
    """Stable, diff-friendly view: 'METHOD /path' -> sorted response codes."""
    spec = app.openapi()
    out: dict[str, list[str]] = {}
    for path, methods in spec.get("paths", {}).items():
        for method, op in methods.items():
            if method.lower() in ("get", "post", "put", "patch", "delete"):
                out[f"{method.upper()} {path}"] = sorted((op.get("responses") or {}).keys())
    return dict(sorted(out.items()))


def test_openapi_surface_matches_snapshot():
    current = _surface()

    if os.environ.get("UPDATE_CONTRACT") or not SNAPSHOT.exists():
        SNAPSHOT.write_text(json.dumps(current, indent=2, sort_keys=True) + "\n")
        # first-run seeding / explicit refresh — nothing to compare against yet
        return

    expected = json.loads(SNAPSHOT.read_text())
    added = sorted(set(current) - set(expected))
    removed = sorted(set(expected) - set(current))
    changed = sorted(k for k in current if k in expected and current[k] != expected[k])

    msg = []
    if removed:
        msg.append(f"REMOVED endpoints (breaking): {removed}")
    if changed:
        msg.append("CHANGED response codes: "
                   + str({k: {"was": expected[k], "now": current[k]} for k in changed}))
    if added:
        msg.append(f"ADDED endpoints: {added}")
    assert not msg, (
        "OpenAPI surface drifted from the committed contract.\n  "
        + "\n  ".join(msg)
        + "\nIf this change is intentional, run "
          "`UPDATE_CONTRACT=1 pytest tests/test_openapi_contract.py` and commit the snapshot."
    )
