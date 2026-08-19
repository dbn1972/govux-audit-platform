import PublicShell from "@/components/PublicShell";

export const metadata = {
  title: "Contact — GovUX Audit Platform",
  description: "How to reach the UX4G team about Audit 360, and what to include.",
};

// "Contact" was a mailto: in the footer — a blank message window and no idea
// what to put in it. A support request that arrives without a URL, a task ID or
// a browser costs a round trip before anyone can even look.
export default function Contact() {
  return (
    <PublicShell>
      <div className="gx-doc-head">
        <h1 className="mb-2">Contact</h1>
        <p className="gx-lead gx-prose mb-0">
          Questions about Audit 360, a score you think is wrong, or a site that will not scan —
          the UX4G team reads everything sent to the support address.
        </p>
      </div>

      <div className="gx-doc">
        <div className="gx-prose">
          <div className="gx-card mb-4">
            <div className="gx-card-body">
              <div className="gx-label">Support</div>
              <p className="h5 mt-2 mb-1">
                <a href="mailto:support.ux4g@digitalindia.gov.in">support.ux4g@digitalindia.gov.in</a>
              </p>
              <p className="gx-muted mb-0" style={{ fontSize: ".875rem" }}>
                UX4G · National e-Governance Division, Ministry of Electronics &amp; Information
                Technology, Government of India
              </p>
            </div>
          </div>

          <h2 id="include">What to include</h2>
          <p>
            Anything below that applies turns a support request into something that can be answered
            on the first reply rather than the third.
          </p>
          <ul>
            <li>The <b>website address</b> you were auditing.</li>
            <li>The <b>task ID</b> shown on the audit page, if the audit ran.</li>
            <li>What you expected to happen, and what happened instead.</li>
            <li>Your <b>browser and device</b> — a rendering problem is usually specific to one.</li>
            <li>A screenshot, if the problem is something you can see.</li>
          </ul>

          <h2 id="score">If you think a score is wrong</h2>
          <p>
            Send the task ID and the specific finding you disagree with. The engine is deterministic —
            the same page scores the same way every time — so a disputed finding can be traced to the
            exact rule that produced it, and corrected in the rule set if it is wrong.
          </p>

          <h2 id="accessibility">Accessibility of this platform</h2>
          <p>
            If any part of Audit 360 is difficult or impossible for you to use, that is a defect and we
            want to hear about it. Tell us which page, and which assistive technology and settings you
            use. A platform that audits accessibility has no business being inaccessible.
          </p>

          <h2 id="access">Requesting access</h2>
          <p>
            Sign-in is open to anyone with a <code>.gov.in</code> or <code>.nic.in</code> email address —
            you do not need to ask. If your department uses a different domain, write to support with
            the department name and the address you would sign in with.
          </p>
        </div>

        <nav className="gx-toc" aria-label="On this page">
          <h2 className="gx-label">On this page</h2>
          <ol>
            <li><a href="#include">What to include</a></li>
            <li><a href="#score">A score you dispute</a></li>
            <li><a href="#accessibility">Accessibility</a></li>
            <li><a href="#access">Requesting access</a></li>
          </ol>
        </nav>
      </div>
    </PublicShell>
  );
}
