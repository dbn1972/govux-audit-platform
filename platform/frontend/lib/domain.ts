/** Domain-input normalisation.
 *
 *  The register-a-domain field asks for a host, but people reach for the
 *  address bar and paste what is there: "https://www.epfo.gov.in/". The
 *  .gov.in / .nic.in check is anchored to the end of the string, so that
 *  trailing slash made a perfectly valid government domain fail with
 *  "Only .gov.in / .nic.in domains are accepted" — an error about the wrong
 *  thing, and one the reader cannot act on, because what they pasted *is* a
 *  .gov.in domain. Widening the check would have been the smaller edit and
 *  the wrong one: it would store a URL in a column the crawler reads as a host.
 *
 *  Two functions, because when you normalise matters as much as how. A rule
 *  that is safe on a finished string is not necessarily safe on a half-typed
 *  one: strip a trailing dot as it is typed and "indiapost.gov.in" arrives as
 *  "indiapostgovin", because every dot is a trailing dot for the instant
 *  before the next key. Only the scheme is safe per-keystroke — it sits at the
 *  start, and "://" cannot occur in a host, so what follows still appends.
 */

/** Per-keystroke safe. */
export function stripScheme(value: string): string {
  return value.replace(/^\s*[a-z][a-z0-9+.-]*:\/\//i, "").replace(/^\s+/, "");
}

/** The full reduction to a bare host — for blur and submit, never for change. */
export function hostOnly(value: string): string {
  return stripScheme(value)
    .trim()
    .replace(/^[^/?#@]*@/, "")   // user:password@
    .split(/[/?#]/)[0]           // path, query, fragment
    .replace(/:\d+$/, "")        // port
    .replace(/\.+$/, "");        // FQDN trailing dot
}


/** Closed vocabulary, mirroring SERVICE_CATEGORIES in routers/domains.py.
 *  These segment the like-for-like rankings, so the API rejects anything else
 *  rather than quietly creating a segment no filter can reach. */
export const SERVICE_CATEGORIES: [string, string][] = [
  ["transactional", "Transactional"],
  ["information", "Information"],
  ["payments", "Payments"],
];
