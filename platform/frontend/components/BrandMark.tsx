/** The GovUX mark: a verification tick on a navy field.
 *
 *  Shared by the signed-in shell, the public landing page and the sign-in
 *  screen. It lived in three places as three slightly different gradient
 *  tiles reading "GX", which is how an identity drifts: the landing page's
 *  was 40px and 10px-radius, the shell's 34px and 9px, and neither said
 *  anything about what the platform does. This one is drawn, so it stays
 *  crisp at any size and inherits the theme.
 */
export default function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <span className="gx-brand-mark" aria-hidden="true"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.265) }}>
      <svg width={Math.round(size * 0.59)} height={Math.round(size * 0.59)}
        viewBox="0 0 24 24" fill="none">
        <path d="M4.8 12.6l4.9 4.9L19.2 7" stroke="#fff" strokeWidth="2.8"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
