"""Advisory ML — XGBoost finding-priority ranking (out of the score path)."""
from app.services import ml_priority


def test_features_order_and_length():
    f = ml_priority.features({"severity": "critical", "effort": "low", "level": "A",
                              "instances": 5, "cat_weight": 22, "legal": True})
    assert len(f) == len(ml_priority.FEAT_ORDER)
    assert f[0] == 4.0 and f[1] == 3.0 and f[2] == 1.0 and f[-1] == 1.0


def test_bootstrap_ranks_high_impact_first():
    model = ml_priority.bootstrap_train(n=1500)
    findings = [
        {"id": "trivial", "severity": "low", "effort": "high", "level": "", "instances": 1,
         "cat_weight": 6, "legal": False},
        {"id": "urgent", "severity": "critical", "effort": "low", "level": "A", "instances": 8,
         "cat_weight": 22, "legal": True},
    ]
    ranked = ml_priority.rank(model, findings)
    assert ranked[0]["id"] == "urgent"
    assert ranked[0]["ml_priority"] > ranked[1]["ml_priority"]


def test_rank_empty():
    assert ml_priority.rank(object(), []) == []


def test_save_load_roundtrip(tmp_path):
    model = ml_priority.bootstrap_train(n=800)
    p = str(tmp_path / "p.joblib")
    ml_priority.save(model, p)
    loaded = ml_priority.load(p)
    assert loaded is not None
    r = ml_priority.rank(loaded, [{"id": "x", "severity": "critical", "effort": "low",
                                   "level": "A", "instances": 3, "cat_weight": 22, "legal": True}])
    assert r[0]["ml_priority"] is not None


def test_load_missing_returns_none(tmp_path):
    assert ml_priority.load(str(tmp_path / "nope.joblib")) is None
