"""Deterministic computer-vision design score (replaces the hardcoded design: 70).

Measures objective visual-design signals from the rendered screenshot — palette
discipline, whitespace/breathing room, visual clutter, and vertical balance —
with deterministic pixel algorithms (colour quantisation, gradient/edge density).

IMPORTANT: this is deliberately NOT a learned model. The design category is in
the numeric score path, which must stay deterministic and reproducible (domain
rules #1 and #4). Same screenshot ⇒ same score. A CNN would be advisory-only.
"""
from __future__ import annotations
from io import BytesIO


def _clamp(x, lo=0.0, hi=100.0):
    return max(lo, min(hi, x))


def assess(signals: dict) -> float:
    """Combine deterministic signals into a 0–100 design score. Pure."""
    palette = signals.get("palette", 10)          # distinct dominant colours
    bg_share = signals.get("bg_share", 0.5)        # largest single-colour area share
    edge = signals.get("edge", 10.0)               # mean gradient (visual busyness)
    balance = signals.get("balance", 1.0)          # top/bottom content-density ratio (~1 = balanced)

    # palette discipline: reward ~5–16 dominant colours; penalise sprawl or barrenness
    palette_score = 100 - max(0, palette - 16) * 3.0 - max(0, 5 - palette) * 5.0
    # breathing room: healthy background share ~0.35–0.8
    if bg_share < 0.3:
        ws_score = 100 - (0.3 - bg_share) * 200
    elif bg_share > 0.85:
        ws_score = 100 - (bg_share - 0.85) * 300
    else:
        ws_score = 100
    # clutter: penalise very busy pages (high edge density)
    clutter_score = 100 - max(0, edge - 12) * 3.0
    # balance: penalise strongly top- or bottom-heavy layouts
    balance_score = 100 - abs(1.0 - balance) * 60

    score = (0.35 * _clamp(palette_score) + 0.25 * _clamp(ws_score)
             + 0.25 * _clamp(clutter_score) + 0.15 * _clamp(balance_score))
    return round(_clamp(score), 1)


def signals_from_image(png_bytes: bytes) -> dict:
    """Extract deterministic design signals from image bytes (PIL + numpy)."""
    from PIL import Image
    import numpy as np

    img = Image.open(BytesIO(png_bytes)).convert("RGB")
    if img.width > 360:
        img = img.resize((360, max(1, int(360 * img.height / img.width))))
    arr = np.asarray(img).astype(np.int32)
    h, w, _ = arr.shape

    # palette: quantise to 8 levels/channel, count colours covering > 0.5% of area
    q = arr // 32
    flat = (q[:, :, 0] * 64 + q[:, :, 1] * 8 + q[:, :, 2]).ravel()
    counts = np.bincount(flat, minlength=512).astype(float)
    total = counts.sum()
    frac = counts / total if total else counts
    palette = int((frac > 0.005).sum())
    bg_share = float(frac.max()) if total else 0.5

    # clutter: mean absolute gradient (edge density)
    gray = arr.mean(axis=2)
    gx = float(np.abs(np.diff(gray, axis=1)).mean()) if w > 1 else 0.0
    gy = float(np.abs(np.diff(gray, axis=0)).mean()) if h > 1 else 0.0
    edge = (gx + gy) / 2.0

    # vertical balance: content (non-background) density top vs bottom half
    nonbg = (gray < 245).astype(float)   # rough "has ink" mask on light UIs
    top = nonbg[: h // 2].mean() if h >= 2 else nonbg.mean()
    bot = nonbg[h // 2:].mean() if h >= 2 else nonbg.mean()
    balance = float((top + 1e-3) / (bot + 1e-3))

    return {"palette": palette, "bg_share": round(bg_share, 3),
            "edge": round(edge, 2), "balance": round(balance, 3)}


def score_image(png_bytes: bytes) -> dict:
    sig = signals_from_image(png_bytes)
    return {"score": assess(sig), "signals": sig}


def score_from_path(path: str) -> float | None:
    """Return the design score for a screenshot file, or None if unavailable."""
    import os
    if not path or not os.path.exists(path):
        return None
    try:
        with open(path, "rb") as f:
            return score_image(f.read())["score"]
    except Exception:
        return None
