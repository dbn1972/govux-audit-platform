#!/usr/bin/env python3
"""Build the unified GovUX guideline catalogue.

One row per checkable guideline across every source the platform audits against,
each tagged with how far it can be automated. Written as a generator rather than
a hand-maintained sheet so that upgrading axe-core or Lighthouse re-derives the
inventory instead of silently drifting from it.

Sources
  WCAG 2.2 A/AA   canonical success criteria (data/wcag22_aa.csv)
  GIGW 3.0        mandatory elements the engine checks + clauses cited by UX4G
  Lighthouse      live audit list read from the installed package
  axe-core        live rule list read from the installed package
  UX4G Mastersheet the 412-row v3.0.0 sheet
  GovUX-unique    detectors this platform has that no source above covers

Automation levels
  automated  a deterministic pass/fail with no human judgement — safe for the score
  assisted   machine narrows it down, a human decides (flag for review)
  manual     judgement only; belongs to the assessor checklist, never the score

Usage:
  python3 scripts/build_guideline_catalogue.py \
      --mastersheet "Guidelines Mastersheet v.3.0.0 - Master Sheet.csv" \
      --tools /tmp/tools.json --out data/guideline_catalogue.csv
"""
from __future__ import annotations
import argparse, csv, json, pathlib, re, sys, collections

HERE = pathlib.Path(__file__).resolve().parent
FIELDS = ["catalogue_id", "source", "family", "title", "automation", "tool",
          "govux_category", "reference", "notes"]

# ---------------------------------------------------------------------------
# GovUX-unique detectors: present in audit_engine/runner.js, absent from every
# external source. Kept explicit so a deleted detector shows up as a diff here.
GOVUX_UNIQUE = [
    ("GOVUX-rti", "GIGW mandatory: Right to Information link", "automated", "govux-engine",
     "gigw", "Statutory (RTI Act 2005); not present in the UX4G mastersheet"),
    ("GOVUX-last-updated", "GIGW mandatory: last updated / reviewed date", "automated",
     "govux-engine", "gigw", ""),
    ("GOVUX-copyright-policy", "GIGW mandatory: copyright policy link", "automated",
     "govux-engine", "gigw", ""),
    ("GOVUX-terms", "GIGW mandatory: terms of use link", "automated", "govux-engine",
     "gigw", ""),
    ("GOVUX-accessibility-statement", "GIGW mandatory: accessibility statement",
     "automated", "govux-engine", "gigw", ""),
    ("GOVUX-sitemap", "GIGW mandatory: sitemap link", "automated", "govux-engine",
     "gigw", ""),
    ("GOVUX-metadata-desc", "GIGW mandatory: meta description", "automated",
     "govux-engine", "gigw", ""),
    ("GOVUX-security-headers", "HSTS / CSP / X-Frame-Options / X-Content-Type-Options",
     "automated", "govux-engine", "trust", ""),
    ("GOVUX-trackers-consent", "Third-party trackers vs DPDP s6 consent", "automated",
     "govux-engine", "trust", "DPDP Act 2023 s6"),
    ("GOVUX-integrity-overlay", "Accessibility-overlay widget detection", "automated",
     "govux-engine", "accessibility",
     "Anti-gaming: overlays inflate automated a11y scores without fixing anything"),
    ("GOVUX-integrity-gaming", "Compliance-theatre heuristics", "automated",
     "govux-engine", "gigw", "Caps the verdict, never the score"),
    ("GOVUX-pdf-ua", "Linked PDF/document accessibility (PDF-UA)", "assisted",
     "govux-engine", "accessibility", ""),
    ("GOVUX-cross-browser", "Chromium/Firefox/WebKit render + JS error matrix",
     "automated", "govux-engine", "responsiveness", ""),
    ("GOVUX-reflow-overflow", "Horizontal overflow at mobile width", "automated",
     "govux-engine", "responsiveness", ""),
    ("GOVUX-broken-links", "Broken internal links (4xx/5xx)", "automated",
     "govux-engine", "content", ""),
    ("GOVUX-readability", "Reading-level / plain-language score", "assisted",
     "govux-engine", "content", ""),
    ("GOVUX-script-lang", "Indic script vs declared lang attribute", "automated",
     "govux-engine", "content", ""),
]

# Nielsen's 10 usability heuristics — the evaluative frame behind the UX4G sheet.
# None are machine-decidable; they exist here so an assessor's report can cite one.
NIELSEN = [
    "Visibility of system status",
    "Match between system and the real world",
    "User control and freedom",
    "Consistency and standards",
    "Error prevention",
    "Recognition rather than recall",
    "Flexibility and efficiency of use",
    "Aesthetic and minimalist design",
    "Help users recognise, diagnose and recover from errors",
    "Help and documentation",
]

# Lighthouse category -> GovUX scoring category
LH_CATEGORY = {"performance": "performance", "accessibility": "accessibility",
               "best-practices": "trust", "seo": "content"}

# UX4G mastersheet category -> GovUX scoring category. Anything unmapped lands in
# "usability", which is the sheet's centre of gravity.
UX4G_CATEGORY = {
    "Accessibility": "accessibility", "Performance Optimization": "performance",
    "Trust & Credibility": "trust", "Responsiveness": "responsiveness",
    "Mobile First Approach": "responsiveness", "Writing & Content Quality": "content",
    "Page Layout and Visual Design": "design",
    "Macro & Micro Interactions and Animations": "design",
    "Banners and Graphics": "design", "Data Visualisations & Infographics": "design",
}

# The mastersheet's AI Support column mixes two vocabularies (see notes in the
# repo): an automatability scale and a stray confidence scale. Map what is
# meaningful; treat the confidence values as unknown rather than guessing.
UX4G_AUTOMATION = {
    "deterministic": "automated", "automated": "automated",
    "assisted": "assisted", "partial": "assisted", "partially automated": "assisted",
    "assistive": "assisted", "partial (linting, aria checks)": "assisted",
    "evaluative": "manual", "manual": "manual", "manual (tool verification)": "manual",
}


def load_wcag(path: pathlib.Path) -> list[dict]:
    if not path.exists():
        sys.exit(f"missing {path} — the canonical WCAG 2.2 A/AA list must be supplied, "
                 f"not reconstructed from tool metadata (tools only know what they test)")
    return list(csv.DictReader(path.open()))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mastersheet", required=True)
    ap.add_argument("--tools", required=True, help="JSON from the axe/lighthouse export")
    ap.add_argument("--wcag", default=str(HERE / "data" / "wcag22_aa.csv"))
    ap.add_argument("--out", default=str(HERE / "data" / "guideline_catalogue.csv"))
    args = ap.parse_args()

    tools = json.loads(pathlib.Path(args.tools).read_text())
    axe_by_sc: dict[str, list[str]] = collections.defaultdict(list)
    for r in tools["axe"]:
        if r.get("sc"):
            axe_by_sc[r["sc"]].append(r["id"])

    rows: list[dict] = []

    # ---- WCAG 2.2 A/AA -----------------------------------------------------
    for w in load_wcag(pathlib.Path(args.wcag)):
        sc = w["sc"].strip()
        covered = axe_by_sc.get(sc, [])
        rows.append(dict(
            catalogue_id=f"WCAG-{sc}", source="WCAG 2.2", family=f"Level {w['level'].strip()}",
            title=w["title"].strip(),
            # axe only ships rules it can decide without judgement; everything
            # else is a human call even though the criterion is normative.
            automation="automated" if covered else "manual",
            tool="axe-core" if covered else "",
            govux_category="accessibility", reference=f"WCAG 2.2 SC {sc}",
            notes=("axe rules: " + ", ".join(sorted(covered))) if covered else
                  "no deterministic rule — assessor judgement"))

    # ---- Lighthouse --------------------------------------------------------
    seen_lh = set()
    for a in tools["lighthouse"]:
        if a["id"] in seen_lh:
            continue
        seen_lh.add(a["id"])
        rows.append(dict(
            catalogue_id=f"LH-{a['id']}", source="Lighthouse", family=a["category"],
            title=a["id"].replace("-", " "), automation="automated", tool="lighthouse",
            govux_category=LH_CATEGORY.get(a["category"], "performance"),
            reference=f"Lighthouse {a['category']}", notes=""))

    # ---- UX4G mastersheet --------------------------------------------------
    unknown_automation = 0
    for m in csv.DictReader(pathlib.Path(args.mastersheet).open()):
        raw = (m.get("AI Support") or "").strip().lower()
        auto = UX4G_AUTOMATION.get(raw)
        if auto is None:
            auto, unknown_automation = "manual", unknown_automation + 1
        rows.append(dict(
            catalogue_id=f"UX4G-{m['Stable ID'].strip()}", source="UX4G Mastersheet v3.0.0",
            family=m["Category"].strip(), title=m["Title"].strip(),
            automation=auto, tool="govux-engine" if auto == "automated" else "",
            govux_category=UX4G_CATEGORY.get(m["Category"].strip(), "usability"),
            reference=(m.get("References") or "").strip()[:180],
            notes="" if UX4G_AUTOMATION.get(raw) else
                  f"AI Support column held '{raw or 'blank'}' — not an automatability value"))

    # ---- GovUX-unique ------------------------------------------------------
    for cid, title, auto, tool, cat, note in GOVUX_UNIQUE:
        rows.append(dict(catalogue_id=cid, source="GovUX-unique", family="GovUX engine",
                         title=title, automation=auto, tool=tool, govux_category=cat,
                         reference="", notes=note))

    # ---- Nielsen heuristics ------------------------------------------------
    for i, h in enumerate(NIELSEN, 1):
        rows.append(dict(catalogue_id=f"HEU-{i}", source="Nielsen heuristics",
                         family="Usability heuristic", title=h, automation="manual",
                         tool="", govux_category="usability",
                         reference="Nielsen (1994)",
                         notes="Evaluative frame for assessor review; never scored"))

    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)

    by_source = collections.Counter(r["source"] for r in rows)
    by_auto = collections.Counter(r["automation"] for r in rows)
    print(f"wrote {len(rows)} rows -> {out}")
    print("\nby source:")
    for k, v in by_source.most_common():
        print(f"  {v:>4}  {k}")
    print("\nby automation:")
    for k in ("automated", "assisted", "manual"):
        print(f"  {by_auto[k]:>4}  {k}")
    if unknown_automation:
        print(f"\n{unknown_automation} mastersheet rows had no usable AI Support value "
              f"and were filed as manual (safe default — never inflates the score)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
