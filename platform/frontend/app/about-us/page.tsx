import PublicShell from "@/components/PublicShell";

export const metadata = {
  title: "About Audit 360 — GovUX Audit Platform",
  description: "What Audit 360 is, how it helps, and what the tool checks.",
};

// Content mirrors audit360.ux4g.gov.in/about-us. Two typos in the source are
// corrected here ("hompage", "single clock"); everything else is as published.
export default function AboutUs() {
  return (
    <PublicShell>
      <div className="gx-prose">
        <h1 className="mb-2">About Audit 360</h1>
        <p className="gx-lead">
          A comprehensive UX audit tool for evaluating and improving the user experience of a website.
        </p>

        <h2>What is Audit 360?</h2>
        <p>
          Audit 360 is a comprehensive UX audit tool designed to evaluate and improve the user
          experience of a website. It automates the process of analyzing key aspects such as
          performance, accessibility, security, SEO, and usability. By providing actionable insights,
          Audit 360 helps teams identify areas for improvement and deliver exceptional user
          experiences. It also helps the website team in improving their digital assets and
          performance monitoring of the same.
        </p>
        <div className="gx-callout">
          <i className="bi bi-info-circle" aria-hidden="true" />
          <div>
            <b>Note:</b> This tool is currently best suited for conducting UX audits of key pages such
            as the Homepage, About Us, Contact Us, and Sign Up sections of a website. Additionally, you
            may include up to three more links from the same website for analysis.
            <p className="mb-0 mt-2">
              The UX4G team is actively working to enhance the tool’s capabilities to support full
              sitemap coverage, ensuring a more comprehensive and automated UX audit experience. We are
              committed to delivering the best possible experience.
            </p>
          </div>
        </div>

        <h2>How can the tool help you?</h2>
        <p>
          Audit 360 simplifies the process of conducting UX audits, saving time and effort for
          designers, developers, and product managers. The tool provides:
        </p>
        <ul>
          <li>
            <b>Automated report:</b> instant UX audit results for a website’s homepage with a single
            click, reducing manual intervention across 99+ UX/UI audit parameters.
          </li>
          <li><b>Actionable insights:</b> recommendations to fix identified issues.</li>
          <li>
            <b>Holistic analysis:</b> assess multiple aspects of your website, including UX4G
            compliance, accessibility, performance, and SEO.
          </li>
          <li>
            <b>Improved user experience:</b> enhance your product’s usability and customer satisfaction
            by addressing problem areas.
          </li>
        </ul>
        <p>
          Whether you are optimizing an existing product or building a new one, Audit 360 ensures you
          deliver a seamless and user-friendly experience.
        </p>

        <h2 id="features">What the tool checks</h2>
      </div>

      {/* Five checks, five cards: as a bullet list inside body copy they read as
          one paragraph of prose, and this is the section people scan to decide
          whether the tool covers what they care about. */}
      <div className="gx-feature-grid">
        {[
          ["bi-speedometer2", "Performance", "Speed and performance metrics, measured with Lighthouse."],
          ["bi-universal-access-circle", "Accessibility", "Conformance against the WCAG accessibility guidelines."],
          ["bi-file-text", "Content", "Content quality, structure and readability."],
          ["bi-search", "SEO", "On-page factors that affect search visibility."],
          ["bi-check2-square", "UX4G compliance matrix", "A compliance check against UX4G standards across 99+ UX/UI parameters, with a score and recommendations."],
        ].map(([icon, title, body]) => (
          <div className="gx-feature-card" key={title}>
            <div className="gx-feature-icon"><i className={`bi ${icon}`} aria-hidden="true" /></div>
            <h3>{title}</h3>
            <p>{body}</p>
          </div>
        ))}
      </div>

      <div className="gx-prose">
        <p>
          Each check returns compliant, non-compliant or actionable feedback, so a finding always comes
          with something you can do about it.
        </p>

        <h2 id="conclusion">In short</h2>
        <p>
          Audit 360 streamlines UX audits and helps teams improve their products efficiently. By
          automating the evaluations and offering actionable insights, it lets organisations deliver
          better digital experiences — and take a step closer to services that are user-friendly,
          high-performing and accessible.
        </p>
      </div>

      <div className="gx-cta mt-5">
        <div>
          <h2 className="h4 mb-1">Scan a site now</h2>
          <p className="mb-0" style={{ opacity: .85, maxWidth: "56ch" }}>
            One public page, no sign-in, a score and a PDF in seconds. Sign in with a government email
            to audit up to ten pages and track scores over time.
          </p>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <a href="/" className="btn btn-light fw-semibold" style={{ color: "var(--gx-navy-800)" }}>
            Free scan
          </a>
          <a href="/login" className="btn btn-outline-light fw-semibold">Sign in</a>
        </div>
      </div>
    </PublicShell>
  );
}
