"""Advisory ML — regression / anomaly detection over audit score history.

An IsolationForest is trained on the feature vectors (overall + 8 category scores)
of completed audits. A new audit that sits far from the learned distribution is
flagged for human review — e.g. a sudden regression after a redesign.

This is STRICTLY advisory and lives OUTSIDE the numeric score path (domain rule
#1): it never changes the GovUX Score; it only adds an advisory finding and an
`anomaly_score`. scikit-learn is imported lazily so the app never hard-depends on
it — if no model is present, everything degrades to a no-op.
"""
from __future__ import annotations
import os

# feature order — overall first, then the 8 categories (must stay stable)
FEATURES = ["overall", "accessibility", "usability", "gigw", "design",
            "performance", "responsiveness", "content", "trust"]
MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "models", "anomaly.joblib")
MIN_TRAIN = 20   # below this the distribution is too small to be meaningful


def features_from(overall: float, categories: dict) -> list[float]:
    row = [float(overall or 0.0)]
    for c in FEATURES[1:]:
        row.append(float(categories.get(c, 0.0)))
    return row


def train(rows: list[list[float]], contamination: float = 0.1):
    """Fit an IsolationForest on feature rows. Deterministic (fixed seed)."""
    from sklearn.ensemble import IsolationForest
    model = IsolationForest(n_estimators=200, contamination=contamination, random_state=42)
    model.fit(rows)
    return model


def save(model, path: str | None = None) -> str:
    import joblib
    path = path or MODEL_PATH
    os.makedirs(os.path.dirname(path), exist_ok=True)
    joblib.dump(model, path)
    return path


def load(path: str | None = None):
    """Return the trained model, or None if it doesn't exist / can't load."""
    import importlib.util
    path = path or MODEL_PATH
    if not os.path.exists(path) or importlib.util.find_spec("joblib") is None:
        return None
    try:
        import joblib
        return joblib.load(path)
    except Exception:
        return None


def score_one(model, feats: list[float]) -> dict:
    """Return {is_anomaly, score}. decision_function: higher = more normal;
    predict: -1 = outlier, 1 = inlier."""
    pred = int(model.predict([feats])[0])
    score = float(model.decision_function([feats])[0])
    return {"is_anomaly": pred == -1, "score": round(score, 3)}
