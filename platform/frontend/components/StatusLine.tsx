import Icon from "@/components/Icon";

/** The result of a form action, said once and said consistently.
 *
 *  Fifteen call sites across seven screens each built their own by prefixing a
 *  ✓ or ✗ character to the message string. Three problems with that: success
 *  and failure rendered in the same muted grey, so the glyph was the only
 *  difference and it is small, unlabelled and easy to miss; the characters are
 *  announced inconsistently by screen readers (some say "check mark", some say
 *  nothing); and they sidestepped the icon system every other part of the app
 *  uses, so they did not scale with text size or follow the theme.
 *
 *  Here the outcome is data, not a character in a string, which is what lets
 *  the icon, the ink and the live-region politeness follow from it.
 */
export default function StatusLine(
  { ok, text, className = "" }: { ok: boolean; text: string; className?: string }
) {
  return (
    <div
      className={`ux4g-fs-14 ux4g-d-flex ux4g-ai-start ux4g-gap-2xs ${className}`}
      role="status"
      // An error is worth interrupting for; a confirmation is not.
      aria-live={ok ? "polite" : "assertive"}
      style={{ color: ok ? "var(--gx-on-success)" : "var(--gx-on-error)" }}
    >
      <Icon name={ok ? "check-circle" : "exclamation-triangle"} size={14}
        className="ux4g-flex-shrink-0 ux4g-mt-3xs" />
      <span>{text}</span>
    </div>
  );
}
