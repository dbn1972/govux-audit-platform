"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Sub-navigation shared by every per-audit view.
 *
 * These seven screens each analyse the same audit, but four of them —
 * remediation, documents, compatibility and trends — had no inbound link from
 * anywhere in the app and were reachable only by typing the URL. Two of those
 * are BRD gap-closure deliverables (G3 document accessibility, G5 remediation),
 * so real, finished features were invisible to every user.
 *
 * Putting the strip on all seven makes them mutually reachable and gives the
 * audit a single, coherent shape. Guarded by scripts/verify_reachability.py.
 */
// Full route templates rather than suffixes, so each path appears verbatim in
// the source. scripts/verify_reachability.py greps for literal route strings;
// building these from `/audits/${id}${suffix}` would hide every one of them and
// the orphan check would keep failing on routes that ARE linked.
const TABS: [string, string][] = [
  ["Report", "/audits/[id]/report"],
  ["Prioritised issues", "/audits/[id]/issues"],
  ["Remediation plan", "/audits/[id]/remediation"],
  ["Documents", "/audits/[id]/documents"],
  ["Compatibility", "/audits/[id]/compatibility"],
  ["Trend & history", "/audits/[id]/trends"],
  ["Compare", "/audits/[id]/compare"],
];

export default function AuditNav({ id }: { id: string }) {
  const path = usePathname();
  return (
    <nav aria-label="Audit views">
      <ul className="nav nav-tabs mb-3 flex-nowrap overflow-auto">
        {TABS.map(([label, template]) => {
          const href = template.replace("[id]", id);
          const active = path === href;
          return (
            <li className="nav-item" key={template}>
              <Link href={href}
                className={`nav-link text-nowrap${active ? " active" : ""}`}
                aria-current={active ? "page" : undefined}>{label}</Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
