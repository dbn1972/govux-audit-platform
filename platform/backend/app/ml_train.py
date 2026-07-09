"""Train the advisory anomaly model over completed audits.

    docker compose exec api python -m app.ml_train

Advisory only — the model never enters the numeric score path. Re-run
periodically (or from the scheduler) as more audits accumulate.
"""
from .database import SessionLocal
from . import models
from .services import ml_anomaly, ml_priority


def collect_rows(db) -> list[list[float]]:
    rows = []
    audits = (db.query(models.Audit)
                .filter(models.Audit.status == "completed",
                        models.Audit.overall_score.isnot(None)).all())
    for a in audits:
        cats = {s.category: float(s.score)
                for s in db.query(models.AuditScore).filter(models.AuditScore.audit_id == a.id)}
        rows.append(ml_anomaly.features_from(float(a.overall_score), cats))
    return rows


def main():  # pragma: no cover - operational entrypoint
    # advisory priority ranker: bootstrapped on a synthetic label set (no DB needed)
    ppath = ml_priority.save(ml_priority.bootstrap_train())
    print(f"trained XGBoost priority ranker -> {ppath}")

    db = SessionLocal()
    try:
        rows = collect_rows(db)
        if len(rows) < ml_anomaly.MIN_TRAIN:
            print(f"only {len(rows)} completed audits; need >= {ml_anomaly.MIN_TRAIN} to train anomaly model.")
            return
        model = ml_anomaly.train(rows)
        path = ml_anomaly.save(model)
        print(f"trained IsolationForest on {len(rows)} audits -> {path}")
    finally:
        db.close()


if __name__ == "__main__":  # pragma: no cover
    main()
