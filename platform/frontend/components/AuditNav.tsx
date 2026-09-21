"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { api } from "@/lib/api";
import { absolute } from "@/lib/format";

/**
 * Sub-navigation shared by every per-audit view.
 *
 * These eight screens each analyse the same audit, but four of them —
 * remediation, documents, compatibility and trends — had no inbound link from
 * anywhere in the app and were reachable only by typing the URL. Two of those
 * are BRD gap-closure deliverables (G3 document accessibility, G5 remediation),
 * so real, finished features were invisible to every user.
 *
 * Putting the strip on all of them makes them mutually reachable and gives the
 * audit a single, coherent shape. Guarded by scripts/verify_reachability.py.
 *
 * It also carries the context bar, because the tabs alone left a reader
 * stranded: six of the seven views head themselves after the VIEW ("Prioritised
 * issues", "Remediation plan") and never name the audit, so arriving from a
 * bookmark or a shared link you could read 27 findings without learning whose
 * site they describe or which run produced them. Only the report page named the
 * domain. The bar answers both, and carries the one route out — the rail's
 * "Audit History" was the only way back to the list.
 */
// Full route templates rather than suffixes, so each path appears verbatim in
// the source. scripts/verify_reachability.py greps for literal route strings;
// building these from `/audits/${id}${suffix}` would hide every one of them and
// the orphan check would keep failing on routes that ARE linked.
const TABS: [string, string][] = [
  ["Run status", "/audits/[id]"],
  ["Report", "/audits/[id]/report"],
  ["Prioritised issues", "/audits/[id]/issues"],
  ["Remediation plan", "/audits/[id]/remediation"],
  ["Documents", "/audits/[id]/documents"],
  ["Compatibility", "/audits/[id]/compatibility"],
  ["Trend & history", "/audits/[id]/trends"],
  ["Compare", "/audits/[id]/compare"],
];

type Run = { domain?: string; created_at?: string };

export default function AuditNav({ id, run: given }: { id: string; run?: Run }) {
  const path = usePathname();
  const [fetched, setFetched] = useState<Run | null>(null);
  const run = given ?? fetched;

  // Identity only — the views fetch their own data. A failure here leaves the
  // tabs and the way back intact, which is the part that must not depend on it.
  // The run-status page already holds this, so it passes it in rather than
  // making the same request twice.
  useEffect(() => {
    if (given) return;
    let live = true;
    api.auditStatus(id)
      .then((s: any) => { if (live) setFetched({ domain: s?.domain, created_at: s?.created_at }); })
      .catch(() => {});
    return () => { live = false; };
  }, [id, given]);

  return (
    <div className="ux4g-mb-s">
      <div className="ux4g-d-flex ux4g-ai-center ux4g-flex-wrap ux4g-gap-xs ux4g-mb-2xs">
        <Link href="/audits" className="gx-back ux4g-fs-14">
          <Icon name="arrow-left" size={14} />Audit history
        </Link>
        {run?.domain && (
          <span className="gx-muted ux4g-fs-14">
            <span className="ux4g-fw-semibold">{run.domain}</span>
            {run.created_at ? ` · ${absolute(run.created_at)}` : ""}
          </span>
        )}
      </div>

      {/* `ux4g-tab` and `ux4g-tab-list` are a NESTED pair, not two classes for
          one element: the container is `display:inline-flex; flex-direction:
          column` (tab row above, panel below) and the list is the row inside
          it. Stacking both on the <ul> let the container's `column` win, so
          these tabs rendered as a 280px right-aligned vertical list instead of
          a strip. */}
      <nav aria-label="Audit views" className="ux4g-tab">
        {/* UX4G underline tab strip, but routing-driven: each item is a Next
            <Link>, and the active item is the one whose route matches — not a
            JS-toggled panel. Keeps the `active` class UX4G styles against, and
            preserves aria-current for assistive tech. */}
        <ul className="ux4g-tab-list ux4g-tab-underline ux4g-tab-md ux4g-flex-nowrap ux4g-o-x-auto">
          {TABS.map(([label, template]) => {
            const href = template.replace("[id]", id);
            const active = path === href;
            return (
              <li key={template} style={{ listStyle: "none" }}>
                <Link href={href}
                  className={`ux4g-tab-item ux4g-text-nowrap${active ? " active" : ""}`}
                  aria-current={active ? "page" : undefined}>{label}</Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
