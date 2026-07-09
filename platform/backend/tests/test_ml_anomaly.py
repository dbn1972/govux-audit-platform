"""Advisory ML — IsolationForest anomaly detection (out of the score path)."""
import random
from app.services import ml_anomaly


def test_features_order_and_length():
    f = ml_anomaly.features_from(63.9, {"accessibility": 58, "trust": 90})
    assert f[0] == 63.9 and len(f) == len(ml_anomaly.FEATURES)
    assert f[1] == 58.0 and f[-1] == 90.0        # accessibility, trust in order
    assert f[2] == 0.0                            # missing category -> 0


def test_train_flags_outlier_not_inlier(tmp_path):
    rng = random.Random(0)
    # tight normal cluster around 70 across 9 features
    rows = [[70 + rng.uniform(-3, 3) for _ in range(9)] for _ in range(80)]
    model = ml_anomaly.train(rows, contamination=0.05)

    normal = ml_anomaly.score_one(model, [70] * 9)
    outlier = ml_anomaly.score_one(model, [8] * 9)      # sudden regression
    assert normal["is_anomaly"] is False
    assert outlier["is_anomaly"] is True
    assert outlier["score"] < normal["score"]           # lower = more anomalous


def test_save_load_roundtrip(tmp_path):
    rows = [[70.0] * 9 for _ in range(30)]
    model = ml_anomaly.train(rows)
    p = str(tmp_path / "m.joblib")
    ml_anomaly.save(model, p)
    loaded = ml_anomaly.load(p)
    assert loaded is not None
    assert ml_anomaly.score_one(loaded, [70] * 9)["is_anomaly"] is False


def test_load_missing_returns_none(tmp_path):
    assert ml_anomaly.load(str(tmp_path / "nope.joblib")) is None


def test_ml_train_collect_rows(db, ctx, verified_domain):
    from app import models
    from app.ml_train import collect_rows
    a = models.Audit(domain_id=verified_domain.id, engine_version="t",
                     status="completed", overall_score=64)
    db.add(a); db.flush()
    for c, s in [("accessibility", 58), ("trust", 90)]:
        db.add(models.AuditScore(audit_id=a.id, category=c, weight=10, score=s))
    db.commit()
    rows = collect_rows(db)
    assert rows and all(len(r) == len(ml_anomaly.FEATURES) for r in rows)
