#!/usr/bin/env python3
"""Every route must be reachable by clicking.

`verify_screens.py` proves a route renders. It cannot prove anyone can GET
there. That gap shipped a real bug: /audits/[id]/compare was built, wired to
live data and passing 60/60 screens for weeks while being reachable only by
typing the URL — a feature nobody could find.

This walks app/**/page.tsx, collects every internal link in the codebase
(<Link href>, router.push, location.assign, plain <a href>), normalises dynamic
segments, and fails if a route is linked from nowhere.

    python3 scripts/verify_reachability.py

Exit 0 = every route is reachable (or explicitly excused below).
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "frontend"
APP = ROOT / "app"

# Routes that legitimately have no in-app link, each with the reason it is
# entered some other way. Keep this list short and justified — it is the escape
# hatch that lets the check stay strict everywhere else.
ENTRY_POINTS = {
    "/scan": "public free-scanner; entered from marketing/external links",
    "/showcase/[slug]": "public share URL for a published Studio prototype",
}

# Any string literal that looks like an internal path counts as a reference.
# Deliberately broader than `href=`: the AppShell nav is a table of tuples
# (["National Dashboard", "/admin/national", "bi-bank"]), and router.push /
# location.assign / redirect all take bare strings too. Matching only href=
# reported 22 false orphans that are in fact in the sidebar. Breadth is the
# right trade here — a checker that cries wolf gets switched off, and the bug
# this exists to catch (a route referenced literally nowhere) is still caught.
PATH_LITERAL = re.compile(r"""["'`](/[A-Za-z0-9_\-/\[\]${}.]*)["'`]""")


def routes() -> dict[str, Path]:
    out = {}
    for p in sorted(APP.rglob("page.tsx")):
        rel = p.relative_to(APP).parent.as_posix()
        out["/" + ("" if rel == "." else rel)] = p
    return out


def normalise(href: str) -> str:
    """Reduce a link to its route shape: strip query/hash, collapse template
    interpolations and concrete ids into the `[param]` form used by the app dir."""
    href = href.split("?")[0].split("#")[0]
    href = re.sub(r"\$\{[^}]*\}", "[param]", href)            # `/audits/${id}/report`
    href = re.sub(r"\[[^\]]+\]", "[param]", href)             # already-dynamic segments
    if len(href) > 1:
        href = href.rstrip("/")
    return href


def collect_links() -> dict[str, set[str]]:
    """route-shape -> set of files that link to it."""
    found: dict[str, set[str]] = {}
    for f in sorted(ROOT.rglob("*.tsx")):
        if "node_modules" in f.parts:
            continue
        text = f.read_text(encoding="utf-8", errors="ignore")
        for m in PATH_LITERAL.finditer(text):
            raw = m.group(1)
            if raw.startswith("//") or raw.startswith("/api/"):
                continue                                       # protocol-relative / backend call
            found.setdefault(normalise(raw), set()).add(
                f.relative_to(ROOT).as_posix())
    return found


def main() -> int:
    all_routes = routes()
    links = collect_links()

    orphans, excused, stale_excuses = [], [], []
    for route, path in sorted(all_routes.items()):
        shape = normalise(route)
        linkers = links.get(shape, set())
        # a page linking only to itself doesn't make it reachable
        self_file = path.relative_to(ROOT).as_posix()
        external_linkers = {l for l in linkers if l != self_file}
        if external_linkers:
            # an excuse for a route that IS linked is dead config — surface it so
            # the allow-list can't quietly accumulate entries that hide nothing
            if route in ENTRY_POINTS:
                stale_excuses.append(route)
            continue
        if route in ENTRY_POINTS:
            excused.append((route, ENTRY_POINTS[route]))
        else:
            orphans.append(route)

    missing = [r for r in ENTRY_POINTS if r not in all_routes]

    width = 42
    print("=" * 60)
    print("ROUTE REACHABILITY".ljust(width) + "RESULT")
    print("=" * 60)
    for route, why in excused:
        print(f"  {route:<38} ENTRY  ({why[:40]})")
    for route in orphans:
        print(f"  {route:<38} \033[91mORPHAN\033[0m")

    linked = len(all_routes) - len(orphans) - len(excused)
    print("=" * 60)
    print(f"ROUTES: {len(all_routes)}   LINKED: {linked}   "
          f"ENTRY POINTS: {len(excused)}   ORPHANED: {len(orphans)}")
    print("=" * 60)

    for route in stale_excuses:
        print(f"  note: '{route}' is in ENTRY_POINTS but is linked — drop the excuse.")
    for route in missing:
        print(f"  note: ENTRY_POINTS lists '{route}', which is not a route any more.")

    if orphans:
        print("\n\033[91mUNREACHABLE ROUTES\033[0m — built, but nothing links to them.")
        print("Add a link from a page or the AppShell nav, or, if the route is")
        print("genuinely entered another way, add it to ENTRY_POINTS with a reason.")
        return 1
    print("\033[92mEVERY ROUTE IS REACHABLE\033[0m")
    return 0


if __name__ == "__main__":
    sys.exit(main())
