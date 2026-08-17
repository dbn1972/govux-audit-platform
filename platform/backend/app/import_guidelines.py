"""Import the UX4G guideline mastersheet into `guidelines`.

    docker compose exec -T api python -m app.import_guidelines --csv - < sheet.csv
    docker compose exec api python -m app.import_guidelines --csv /tmp/sheet.csv --dry-run

Idempotent: rows are upserted on Stable ID, so re-running a corrected sheet
updates in place rather than duplicating. Existing non-UX4G guidelines (the
WCAG/GIGW/CWV seed) are left alone.

The sheet carries four inconsistencies that are normalised on the way in rather
than propagated into the product — see NOTES below. Nothing is silently
discarded: every normalisation is counted and reported.
"""
from __future__ import annotations
import argparse, csv, io, sys, collections

from .database import SessionLocal
from . import models

# NOTE 1 — Severity uses two vocabularies ("Medium Issue" and "Medium"). Same
#          meaning, so they are folded together.
SEVERITY = {
    "big issue": "Big Issue", "big": "Big Issue",
    "medium issue": "Medium Issue", "medium": "Medium Issue",
    "small issue": "Small Issue", "small": "Small Issue",
}

# NOTE 2 — the "AI Support" column mixes an automatability scale with a stray
#          confidence scale (High/Medium/Low). Only the automatability values
#          carry meaning here; the confidence ones say nothing about whether a
#          guideline can be machine-checked, so they fall back to "manual".
#          Erring toward manual is the safe direction: a wrongly-manual
#          guideline costs an assessor time, a wrongly-automated one puts an
#          unverified judgement inside a legal compliance verdict.
AUTOMATION = {
    "deterministic": "automated", "automated": "automated",
    "assisted": "assisted", "partial": "assisted", "partially automated": "assisted",
    "assistive": "assisted", "partial (linting, aria checks)": "assisted",
    "evaluative": "manual", "manual": "manual", "manual (tool verification)": "manual",
}
CONFIDENCE_VALUES = {"high", "medium", "low"}   # wrong column, not automatability

ENFORCEMENT = {"foundational": "Foundational", "optimizing": "Optimizing",
               "advanced": "Advanced"}


# NOTE 5 — "Platform-wise Applicability" holds 16 spellings of three ideas:
#          semicolon and comma separators, with and without emoji, plus a bare
#          "All platforms". Substring matching is deliberate — it survives all
#          of them without enumerating every combination.
def platforms(raw: str | None) -> tuple[bool, bool]:
    """(applies_website, applies_app) — unknown/blank means BOTH.

    Defaulting to both is the safe direction: a guideline wrongly shown costs a
    reviewer a moment, one wrongly hidden is a compliance item silently dropped
    from an audit.
    """
    s = (raw or "").lower()
    if "all platform" in s:
        return True, True
    website = "website" in s or "mobile web" in s
    app = "mobile app" in s
    if not (website or app):
        return True, True
    return website, app


def clean(s: str | None, limit: int | None = None) -> str | None:
    if s is None:
        return None
    s = " ".join(s.split()).strip()
    if not s:
        return None
    return s[:limit] if limit else s


def run(reader, dry_run: bool = False) -> dict:
    stats = collections.Counter()
    db = SessionLocal()
    try:
        for row in reader:
            sid = clean(row.get("Stable ID"))
            title = clean(row.get("Title"))
            if not sid or not title:
                stats["skipped_no_id_or_title"] += 1
                continue

            raw_auto = (row.get("AI Support") or "").strip().lower()
            automation = AUTOMATION.get(raw_auto)
            if automation is None:
                automation = "manual"
                stats["automation_defaulted_to_manual"] += 1
                if raw_auto in CONFIDENCE_VALUES:
                    stats["automation_was_a_confidence_value"] += 1

            raw_sev = (row.get("Severity") or "").strip().lower()
            severity = SEVERITY.get(raw_sev)
            if severity is None and raw_sev:
                stats["severity_unrecognised"] += 1
            if raw_sev in ("medium", "small", "big"):
                stats["severity_normalised"] += 1

            gid = f"UX4G-{sid}"
            g = db.get(models.Guideline, gid)
            if g is None:
                g = models.Guideline(id=gid)
                db.add(g)
                stats["inserted"] += 1
            else:
                stats["updated"] += 1

            g.family = "UX4G"
            g.category = clean(row.get("Category")) or "Uncategorised"
            g.title = title
            g.issue = clean(row.get("Issue"))
            g.advice = clean(row.get("Advice"))
            g.plain_language = clean(row.get("Rationale"))
            g.good_example = clean(row.get("Examples – Pass"))
            g.bad_example = clean(row.get("Examples – Fail"))
            g.enforcement_level = ENFORCEMENT.get(
                (row.get("Enforcement Level") or "").strip().lower())
            g.severity = severity
            g.automation = automation
            g.roles = clean(row.get("Roles"))
            g.source = "UX4G Mastersheet"
            g.reference = clean(row.get("References"), 500)
            g.version = clean(row.get("Version")) or "v3.0.0"
            raw_platform = row.get("Platform-wise Applicability")
            g.applies_website, g.applies_app = platforms(raw_platform)
            if not (raw_platform or "").strip():
                stats["platform_missing_defaulted_to_both"] += 1
            elif g.applies_website and g.applies_app:
                stats["platform_both"] += 1
            elif g.applies_website:
                stats["platform_website_only"] += 1
            else:
                stats["platform_app_only"] += 1

        if dry_run:
            db.rollback()
            stats["ROLLED_BACK_dry_run"] = 1
        else:
            db.commit()
    finally:
        db.close()
    return stats


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True, help="path, or '-' for stdin")
    ap.add_argument("--dry-run", action="store_true",
                    help="parse and report, then roll back (default is to write)")
    args = ap.parse_args()

    if args.csv == "-":
        reader = csv.DictReader(io.StringIO(sys.stdin.read()))
    else:
        reader = csv.DictReader(open(args.csv, encoding="utf-8-sig"))

    stats = run(reader, dry_run=args.dry_run)
    for k, v in sorted(stats.items()):
        print(f"{v:>5}  {k}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
