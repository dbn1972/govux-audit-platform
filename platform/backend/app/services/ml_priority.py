"""Advisory ML — XGBoost finding-priority ranking.

Learns a non-linear urgency ordering over findings from features (severity,
effort, WCAG level, instance count, category weight, legal exposure) and can be
retrained on real assessor-priority labels as they accumulate.

STRICTLY advisory (domain rule #1): it reorders the remediation list only — it
never touches the GovUX Score. The deterministic impact×effort priority remains
the default; `ml_priority` is an advisory overlay. xgboost is imported lazily so
the app never hard-depends on it.

Bootstrap note: with no real labels yet, the model is trained on a *principled
synthetic* target (encoded in `_target`) plus noise, so it generalises smoothly
and is ready to retrain on human rankings later. Until then it broadly agrees
with the deterministic heuristic — its value grows once real labels exist.
"""
from __future__ import annotations
import math
import os

FEAT_ORDER = ["severity", "effort", "level", "instances", "cat_weight", "legal"]
SEV = {"critical": 4, "high": 3, "medium": 2, "low": 1}
EFF = {"low": 3, "medium": 2, "high": 1}   # low effort -> easier -> sooner
MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "models", "priority.joblib")


def features(f: dict) -> list[float]:
    sev = SEV.get(str(f.get("severity", "low")).lower(), 1)
    eff = EFF.get(str(f.get("effort", "medium")).lower(), 2)
    lv = str(f.get("level", "")).upper()
    level = 1.0 if lv == "A" else 0.6 if "AA" in lv else 0.4
    inst = math.log1p(float(f.get("instances", 1) or 1))
    cw = float(f.get("cat_weight", 10))
    legal = 1.0 if f.get("legal") else 0.0
    return [float(sev), float(eff), level, inst, cw, legal]


def _target(feat: list[float]) -> float:
    """Principled synthetic urgency: high impact / legal / reach, low effort => sooner."""
    sev, eff, level, inst, cw, legal = feat
    return sev * 3 + legal * 4 + level * 3 + inst * 1.5 + cw * 0.1 + eff * 1.5


def train(X: list[list[float]], y: list[float]):
    from xgboost import XGBRegressor
    m = XGBRegressor(n_estimators=200, max_depth=3, learning_rate=0.1,
                     random_state=42, verbosity=0)
    m.fit(X, y)
    return m


def bootstrap_train(n: int = 3000):
    """Train on a deterministic principled synthetic label set (see module docstring)."""
    import random
    rng = random.Random(0)
    sevs, effs, levels = list(SEV), list(EFF), ["A", "AA", ""]
    X, y = [], []
    for _ in range(n):
        f = {"severity": rng.choice(sevs), "effort": rng.choice(effs),
             "level": rng.choice(levels), "instances": rng.randint(1, 20),
             "cat_weight": rng.choice([22, 17, 15, 12, 11, 10, 7, 6]),
             "legal": rng.random() < 0.5}
        feat = features(f)
        X.append(feat); y.append(_target(feat) + rng.gauss(0, 1.0))
    return train(X, y)


def save(model, path: str | None = None) -> str:
    import joblib
    path = path or MODEL_PATH
    os.makedirs(os.path.dirname(path), exist_ok=True)
    joblib.dump(model, path)
    return path


def load(path: str | None = None):
    import importlib.util
    path = path or MODEL_PATH
    if not os.path.exists(path) or importlib.util.find_spec("joblib") is None:
        return None
    try:
        import joblib
        return joblib.load(path)
    except Exception:
        return None


def rank(model, findings: list[dict]) -> list[dict]:
    """Return findings with an advisory `ml_priority`, most urgent first."""
    if not findings:
        return []
    preds = model.predict([features(f) for f in findings])
    out = [{**f, "ml_priority": round(float(p), 2)} for f, p in zip(findings, preds)]
    out.sort(key=lambda x: x["ml_priority"], reverse=True)
    return out
