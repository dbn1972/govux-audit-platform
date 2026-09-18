// UX4G spinner (ux4g-web-components 2.1.0 contract): a single self-styled
// element, colour+type via `ux4g-spinner-{variant}-{type}`, size via
// `ux4g-spinner-{size}`. Replaces the Bootstrap `.spinner-border` used across
// the app with the official UX4G loading indicator.
//
// Verified against the installed package: `[class^="ux4g-spinner-"]` carries the
// border + `ux4g-spinner-rotate` animation, so the variant class alone renders.

type SpinnerProps = {
  /** Colour variant. */
  variant?: "primary" | "danger" | "inverse";
  /** Fill type. */
  type?: "full" | "split" | "partial";
  /** Size token. Default md. */
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** Accessible label for standalone use; omit inside an element that already labels the wait. */
  label?: string;
  className?: string;
};

export default function Spinner({
  variant = "primary", type = "split", size = "md", label = "Loading", className = "",
}: SpinnerProps) {
  return (
    <span
      className={`ux4g-spinner-${variant}-${type} ux4g-spinner-${size} ${className}`.trim()}
      role="status"
      aria-label={label}
    />
  );
}
