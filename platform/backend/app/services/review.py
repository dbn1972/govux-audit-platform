"""The manual-review checklist, shared by both of its subjects.

A review hangs off either an engine audit or a standalone manual assessment.
The question a reviewer answers is identical in both cases, so the checklist —
what is reviewable, how it is filtered, how facet counts and the completion
rating are computed — lives here rather than being written twice and drifting.
"""
from __future__ import annotations

from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from .. import models

REVIEWER_ROLES = ("assessor", "programme_admin", "super_admin")
DECISIONS = ("pass", "fail", "not_applicable")

# Matched on `reference` rather than `family`, because every reviewable row is a
# UX4G row — what varies, and what a reviewer wants to filter by, is the
# standard behind it.
STANDARDS = {"WCAG": "%WCAG%", "GIGW": "%GIGW%", "UX4G": "%UX4G%",
             "BIS": "%IS 1%", "DPDP": "%DPDP%"}


def reviewable_filter(platform: str):
    """Guidelines a human must judge, scoped to what the platform can have.

    Excludes `automation='automated'` deliberately: those are decided by the
    engine, and re-asking a person to eyeball them is how checklists become
    rubber stamps. The platform scope mirrors the UX4G self-check's
    Website/App switch — a website reviewer should not be asked about avatar
    menus or walkthrough screens.
    """
    reviewable = models.Guideline.automation.in_(("manual", "assisted"))
    if platform == "app":
        return and_(reviewable, models.Guideline.applies_app.is_(True))
    if platform == "website":
        return and_(reviewable, models.Guideline.applies_website.is_(True))
    return reviewable          # any other value: the full corpus


def build(db: Session, decided_q, platform: str = "website",
          enforcement: str | None = None, category: str | None = None,
          standard: str | None = None) -> dict:
    """The checklist payload. `decided_q` is a query of this subject's decisions."""
    reviewable = reviewable_filter(platform)
    base = db.query(models.Guideline).filter(reviewable)

    q = base
    if enforcement:
        q = q.filter(models.Guideline.enforcement_level == enforcement)
    if category:
        q = q.filter(models.Guideline.category == category)
    if standard and standard in STANDARDS:
        q = q.filter(models.Guideline.reference.ilike(STANDARDS[standard]))
    guidelines = q.order_by(models.Guideline.category, models.Guideline.id).all()

    decided = {r.guideline_id: r for r in decided_q}

    # Answered-per-category across the WHOLE reviewable set, not the filtered
    # page: a reviewer works one category at a time and needs to see which are
    # done without loading each one to find out.
    cat_of = dict(db.query(models.Guideline.id, models.Guideline.category)
                    .filter(reviewable).all())
    answered_by_cat: dict[str, int] = {}
    for gid in decided:
        c = cat_of.get(gid)
        if c:
            answered_by_cat[c] = answered_by_cat.get(c, 0) + 1
    items = [{
        "guideline_id": g.id, "category": g.category, "title": g.title,
        "issue": g.issue, "advice": g.advice,
        "good_example": g.good_example, "bad_example": g.bad_example,
        "enforcement_level": g.enforcement_level, "severity": g.severity,
        "automation": g.automation, "roles": g.roles, "reference": g.reference,
        "decision": decided[g.id].decision if g.id in decided else None,
        "note": decided[g.id].note if g.id in decided else None,
    } for g in guidelines]

    # Facet counts over everything reviewable, independent of the current filter,
    # so choosing a filter is not guesswork about what sits behind it.
    cat_counts = dict(db.query(models.Guideline.category, func.count())
                        .filter(reviewable).group_by(models.Guideline.category).all())
    std_counts = {k: base.filter(models.Guideline.reference.ilike(v)).count()
                  for k, v in STANDARDS.items()}
    # Counted over every decision recorded for this subject, NOT over the
    # filtered page. These are the numbers sign-off is judged against — it reads
    # all of them — so deriving them from the current view meant the screen could
    # show "0 not met" and offer certification while the API refused it because a
    # failure sat in a category the reviewer was not looking at. It also made
    # progress read "1 of 4 answered" with 322 still to do.
    answered_rows = [r for gid, r in decided.items() if gid in cat_of]
    answered = len(answered_rows)
    failed = sum(1 for r in answered_rows if r.decision == "fail")
    passed = sum(1 for r in answered_rows if r.decision == "pass")

    return {
        "categories": [{"name": c, "count": n, "answered": answered_by_cat.get(c, 0)}
                       for c, n in sorted(cat_counts.items())],
        "standards": [{"name": k, "count": n} for k, n in sorted(std_counts.items()) if n],
        "platform": platform,
        "reviewable_total": base.count(),
        # what the current filter shows, as distinct from the totals above
        "total": len(items),
        "page_decided": sum(1 for i in items if i["decision"]),
        "decided": answered,
        "failed": failed,
        "passed": passed,
        # Pass rate over what has actually been answered, N/A excluded — what the
        # UX4G self-check reports. None until something is answered, rather than
        # a misleading 0 or 100.
        "rating": round(100 * passed / (passed + failed), 1) if (passed + failed) else None,
        "items": items,
    }
