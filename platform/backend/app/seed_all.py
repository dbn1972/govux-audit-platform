"""Bring any database to the same known state:  python -m app.seed_all

    docker compose exec api python -m app.seed_all

Local and deployed had drifted: the same email address existed as two unrelated
accounts (one seeded, one self-service) in different organisations, and the
guideline library was four separate steps that were easy to run partially or in
the wrong order. Each of those steps is idempotent on its own, but knowing the
set and the order was tribal knowledge. This is that knowledge, executable.

Order matters:
  1. demo org, users, domains          (app.seed)
  2. UX4G mastersheet -> library       (app.import_guidelines, vendored CSV)
  3. engine-emitted guideline guidance (app.seed_engine_guidelines)
  4. automation reclassification       (app.reclassify_guidelines)

(4) must follow (2) and (3): it decides what is genuinely automated by comparing
the library against the engine's checks, so it needs both populated first.

Safe to re-run. Nothing here deletes data. It does NOT run migrations — do that
first, deliberately:  docker compose exec api alembic upgrade head
"""
from __future__ import annotations
import argparse, csv, pathlib, sys

MASTERSHEET = pathlib.Path(__file__).resolve().parent / "data" / "ux4g_mastersheet_v3.0.0.csv"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-demo", action="store_true",
                    help="library only — leaves demo org/users/domains untouched")
    ap.add_argument("--mastersheet", default=str(MASTERSHEET))
    args = ap.parse_args()

    from . import seed as demo_seed, import_guidelines, seed_engine_guidelines
    from . import reclassify_guidelines

    if not args.skip_demo:
        print("1/4  demo org, users, domains")
        s = demo_seed.seed()
        print(f"     org={s['org']} users +{s['users_created']}/~{s['users_updated']} "
              f"domains +{s['domains_created']}/~{s['domains_adopted']}")
    else:
        print("1/4  demo data skipped (--skip-demo)")

    sheet = pathlib.Path(args.mastersheet)
    if not sheet.exists():
        # Fail loudly: silently skipping leaves a library missing 412 entries,
        # which looks like a working install until an audit reports findings
        # with no guidance behind them.
        print(f"\nERROR: mastersheet not found at {sheet}", file=sys.stderr)
        return 1
    print("2/4  UX4G mastersheet -> guideline library")
    stats = import_guidelines.run(csv.DictReader(sheet.open(encoding="utf-8-sig")))
    print(f"     inserted={stats.get('inserted', 0)} updated={stats.get('updated', 0)} "
          f"automation_defaulted={stats.get('automation_defaulted_to_manual', 0)}")

    print("3/4  guidance for engine-emitted guidelines")
    s3 = seed_engine_guidelines.run()
    print(f"     inserted={s3['inserted']} updated={s3['updated']}")

    print("4/4  reclassify automation against what the engine actually checks")
    s4 = reclassify_guidelines.run()
    print(f"     built={s4['built']} covered={s4['covered']} "
          f"assisted={s4['assisted']} demoted_to_manual={s4['manual']}")

    from .database import SessionLocal
    from . import models
    db = SessionLocal()
    try:
        counts = dict(db.query(models.Guideline.automation,
                               __import__("sqlalchemy").func.count()).group_by(
                                   models.Guideline.automation).all())
    finally:
        db.close()
    total = sum(counts.values())
    print(f"\nlibrary: {total} guidelines "
          f"({counts.get('automated', 0)} automated, {counts.get('assisted', 0)} assisted, "
          f"{counts.get('manual', 0)} manual)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
