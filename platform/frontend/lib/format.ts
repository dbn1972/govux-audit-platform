/** Shared date formatting.
 *
 *  Seven screens each grew their own: `toLocaleDateString()` with no options
 *  (browser-locale, so "18/08/2026" in one place), an explicit en-IN pattern in
 *  another, and a relative helper on the dashboard. The same field — a domain's
 *  last audit — therefore read three different ways in one product.
 *
 *  Two conventions, chosen by what the reader needs:
 *    relative()  "is this stale?"     — lists, tables, activity columns
 *    absolute()  "which day exactly?" — reports, evidence, anything citable
 */

/** "Today" · "3 days ago" · "5 months ago", falling back to an absolute date
 *  past a year, where "14 months ago" stops being easier than the date. */
export function relative(s?: string | null, whenNever = "Never"): string {
  if (!s) return whenNever;
  const t = new Date(s).getTime();
  if (Number.isNaN(t)) return whenNever;
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days < 0) return absolute(s);        // scheduled in the future
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) {
    const m = Math.floor(days / 30);
    return `${m} month${m === 1 ? "" : "s"} ago`;
  }
  return absolute(s);
}

/** "18 Aug 2026" — unambiguous across locales, unlike 08/18 vs 18/08. */
export function absolute(s?: string | null, whenNull = "—"): string {
  if (!s) return whenNull;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return whenNull;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Absolute date with the time, for sessions and audit trails where "which
 *  day" is not precise enough. */
export function absoluteTime(s?: string | null, whenNull = "—"): string {
  if (!s) return whenNull;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return whenNull;
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric",
                                     hour: "2-digit", minute: "2-digit" });
}
