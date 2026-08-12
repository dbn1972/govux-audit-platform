#!/usr/bin/env python3
"""Screen-by-screen structure & reachability test.

Statically validates every prototype screen and every Next.js route: that each
route is well-formed (default export, mounts the shell, renders markup), that
the site has a root route at all, and — the part a render check cannot do —
that every route is actually reachable by clicking.

That last check exists because it caught real bugs a structural check could not:
/audits/[id]/compare passed structure for weeks while being linked from nowhere,
as did the G3/G5 gap-closure screens, and `GET /` served a bare 404 because no
route existed there to be validated in the first place.

Previously split across verify_screens.py and verify_reachability.py, which
walked the route tree twice and disagreed about which routes were exempt from
what. One walk, one exemption list.

Run:  python3 scripts/verify_screens.py
Exit code is non-zero if any check fails.
"""
import os
import re
import sys
import glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROTO = os.path.join(os.path.dirname(ROOT), "prototype")
WEB = os.path.join(ROOT, "frontend")
FE = os.path.join(WEB, "app")

GREEN, RED, DIM, RESET = "\033[92m", "\033[91m", "\033[2m", "\033[0m"
results = []

# Routes that mount no AppShell on purpose: the public landing page and the
# published-prototype view are outside the signed-in chrome; /login is handled
# separately since it is the way in.
NO_SHELL = ("/", "/report", "/showcase/[slug]")

# Routes with no inbound link, each with the reason it is entered another way.
# Keep this short and justified — it is the escape hatch that lets the
# reachability check stay strict everywhere else.
ENTRY_POINTS = {
    "/showcase/[slug]": "public share URL for a published Studio prototype",
}

# Any string literal that looks like an internal path counts as a reference.
# Deliberately broader than `href=`: the AppShell nav is a table of tuples
# (["National Dashboard", "/admin/national", "bi-bank"]), and router.push /
# location.assign / redirect all take bare strings too. Matching only href=
# reported 22 false orphans that are in fact in the sidebar.
PATH_LITERAL = re.compile(r"""["'`](/[A-Za-z0-9_\-/\[\]${}.]*)["'`]""")


def check(name, cond, detail=""):
    results.append((name, cond, detail))


# ---------- prototype screens ----------------------------------------------
def verify_prototype():
    if not os.path.isdir(PROTO):
        return
    present = set(os.listdir(PROTO))
    files = sorted(f for f in present if f.endswith(".html"))
    print(f"\n{'PROTOTYPE SCREENS':<42}{'RESULT'}")
    print("-" * 60)
    for f in files:
        t = open(os.path.join(PROTO, f), encoding="utf-8").read()
        problems = []
        if "app.css" not in t: problems.append("no css")
        if "shell.js" not in t: problems.append("no shell")
        if "window.SCREEN" not in t: problems.append("no SCREEN")
        if "<title>" not in t: problems.append("no title")
        if t.count("<div") != t.count("</div"): problems.append("div imbalance")
        for link in re.findall(r'href="([^"#]+\.html)"', t):
            if link not in present: problems.append(f"deadlink {link}")
        ok = not problems
        print(f"  {f:<40}{GREEN + 'PASS' + RESET if ok else RED + 'FAIL ' + ','.join(problems) + RESET}")
        check(f"prototype/{f}", ok, ",".join(problems))


# ---------- next.js routes --------------------------------------------------
def routes() -> dict:
    out = {}
    for p in sorted(glob.glob(os.path.join(FE, "**", "page.tsx"), recursive=True)):
        route = "/" + os.path.relpath(os.path.dirname(p), FE).replace(os.sep, "/")
        out["/" if route == "/." else route] = p
    return out


def normalise(href: str) -> str:
    """Reduce a link to its route shape: strip query/hash, collapse template
    interpolations and concrete ids into the `[param]` form the app dir uses."""
    href = href.split("?")[0].split("#")[0]
    href = re.sub(r"\$\{[^}]*\}", "[param]", href)      # `/audits/${id}/report`
    href = re.sub(r"\[[^\]]+\]", "[param]", href)       # already-dynamic segments
    return href.rstrip("/") if len(href) > 1 else href


def collect_links() -> dict:
    """route-shape -> set of files referencing it."""
    found: dict = {}
    for f in sorted(glob.glob(os.path.join(WEB, "**", "*.tsx"), recursive=True)):
        if "node_modules" in f:
            continue
        text = open(f, encoding="utf-8", errors="ignore").read()
        for m in PATH_LITERAL.finditer(text):
            raw = m.group(1)
            if raw.startswith("//") or raw.startswith("/api/"):
                continue                                 # protocol-relative / backend call
            found.setdefault(normalise(raw), set()).add(os.path.relpath(f, WEB))
    return found


def verify_frontend():
    if not os.path.isdir(FE):
        return
    all_routes = routes()
    links = collect_links()

    # The root is a special case a per-route check cannot catch: with no
    # app/page.tsx there is no route to validate or to be orphaned, so `GET /`
    # silently served a bare Next.js 404 — the bare domain was a dead end.
    check("root route exists", "/" in all_routes,
          "app/page.tsx is missing, so GET / 404s")

    print(f"\n{'FRONTEND ROUTES':<42}{'RESULT'}")
    print("-" * 60)
    orphans, stale_excuses = [], []

    for route, path in all_routes.items():
        t = open(path, encoding="utf-8").read()
        problems, notes = [], []

        # --- structure ---
        if "export default" not in t:
            problems.append("no default export")
        redirect_only = "redirect(" in t and "className" not in t
        if redirect_only:
            notes.append("redirect")           # renders nothing by design
        else:
            authed = not route.endswith(("/login",))
            if authed and route not in NO_SHELL and "AppShell" not in t:
                problems.append("no AppShell")
            if "className" not in t:
                problems.append("no markup")

        # --- reachability ---
        if route != "/":                       # the bare domain is reachable by definition
            self_file = os.path.relpath(path, WEB)
            linkers = {l for l in links.get(normalise(route), set()) if l != self_file}
            if linkers:
                if route in ENTRY_POINTS:
                    stale_excuses.append(route)
            elif route in ENTRY_POINTS:
                notes.append("entry point")
            else:
                problems.append("unreachable — nothing links here")
                orphans.append(route)

        ok = not problems
        suffix = f" {DIM}({', '.join(notes)}){RESET}" if notes and ok else ""
        print(f"  {route:<40}"
              f"{GREEN + 'PASS' + RESET + suffix if ok else RED + 'FAIL ' + ','.join(problems) + RESET}")
        check(f"route {route}", ok, ",".join(problems))

    for route in stale_excuses:
        print(f"  {DIM}note: '{route}' is in ENTRY_POINTS but is linked — drop the excuse.{RESET}")
    for route in ENTRY_POINTS:
        if route not in all_routes:
            print(f"  {DIM}note: ENTRY_POINTS lists '{route}', which is not a route any more.{RESET}")
    if orphans:
        print(f"\n{RED}UNREACHABLE ROUTES{RESET} — built, but nothing links to them.")
        print("Add a link from a page or the AppShell nav, or, if the route is")
        print("genuinely entered another way, add it to ENTRY_POINTS with a reason.")


def main():
    verify_prototype()
    verify_frontend()
    total = len(results)
    passed = sum(1 for _, ok, _ in results if ok)
    print("\n" + "=" * 60)
    print(f"SCREENS TESTED: {total}   PASSED: {passed}   FAILED: {total - passed}")
    print("=" * 60)
    if passed != total:
        for n, ok, d in results:
            if not ok:
                print(f"  {RED}FAIL{RESET} {n}: {d}")
        sys.exit(1)
    print(f"{GREEN}ALL SCREENS PASS{RESET}")


if __name__ == "__main__":
    main()
