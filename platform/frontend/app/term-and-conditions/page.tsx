import PublicShell from "@/components/PublicShell";
import OnThisPage from "@/components/OnThisPage";

const SECTIONS: [string, string][] = [
  ["definitions", "Definitions"],
  ["acceptance", "Acceptance of terms"],
  ["use", "Use of the Platform"],
  ["obligations", "User obligations"],
  ["ip", "Intellectual property"],
  ["warranties", "Disclaimer of warranties"],
  ["third-party", "Third-party links"],
  ["termination", "Termination"],
  ["law", "Governing law"],
  ["contact", "Contact"],
];

export const metadata = {
  title: "Terms & Conditions — GovUX Audit Platform",
  description: "The terms governing use of the Audit 360 platform.",
};

// Content mirrors audit360.ux4g.gov.in/term-and-conditions. The route keeps the
// source's spelling so links to it resolve the same on both.
export default function TermsAndConditions() {
  return (
    <PublicShell>
      <div className="gx-doc-head">
        <h1 className="mb-2">Terms &amp; Conditions</h1>
        <p className="gx-lead gx-prose mb-0">
          Welcome to Audit 360, an initiative by UX4G. By accessing or using the Audit 360 platform
          (“Platform”), you agree to comply with and be bound by these terms. Please read them
          carefully. If you do not agree to these terms, you must not use the Platform.
        </p>
        <div className="gx-doc-meta">
          <div>
            <dt className="gx-label">Applies to</dt>
            <dd>The Audit 360 platform</dd>
          </div>
          <div>
            <dt className="gx-label">Published by</dt>
            <dd>UX4G · NeGD, MeitY</dd>
          </div>
          <div>
            <dt className="gx-label">Governing law</dt>
            <dd>India</dd>
          </div>
        </div>
      </div>

      <div className="gx-doc">
        <div className="gx-prose">

        <h2 id="definitions">Definitions</h2>
        <dl>
          <dt>Platform</dt>
          <dd>Audit 360, accessible at <a href="https://audit360.ux4g.gov.in/" target="_blank" rel="noopener noreferrer">audit360.ux4g.gov.in</a>.</dd>
          <dt>User</dt>
          <dd>Any individual or entity accessing or using the Platform.</dd>
          <dt>Content</dt>
          <dd>All data, text, images, and other materials available on the Platform.</dd>
          <dt>Services</dt>
          <dd>The functionalities and features provided by Audit 360, including UX audit tools and resources.</dd>
        </dl>

        <h2 id="acceptance">Acceptance of terms</h2>
        <ul>
          <li>By accessing and using the Platform, you confirm that you have read, understood, and agreed to these terms.</li>
          <li>
            These terms may be updated or modified by UX4G at any time without prior notice. Continued
            use of the Platform constitutes acceptance of the revised terms.
          </li>
        </ul>

        <h2 id="use">Use of the Platform</h2>
        <p>
          The Platform is intended for professional use by government entities, organizations, and
          individual users involved in UX audits and compliance activities.
        </p>
        <p>Users must not:</p>
        <ul>
          <li>Violate any applicable laws or regulations.</li>
          <li>Upload, distribute, or share content that is unlawful, defamatory, or infringes on intellectual property rights.</li>
          <li>Attempt to gain unauthorized access to the Platform or its underlying systems.</li>
        </ul>

        <h2 id="obligations">User obligations</h2>
        <ul>
          <li>
            Users are responsible for maintaining the confidentiality of their login credentials and for
            all activities performed under their account.
          </li>
          <li>Users must provide accurate and up-to-date information when creating an account or interacting with the Platform.</li>
        </ul>

        <h2 id="ip">Intellectual property</h2>
        <ul>
          <li>All intellectual property rights related to the Platform, including trademarks, logos, and content, belong to UX4G or its licensors.</li>
          <li>Users may use the Platform and its content solely for their internal purposes. Unauthorized copying, distribution, or modification is prohibited.</li>
        </ul>

        <h2 id="warranties">Disclaimer of warranties</h2>
        <ul>
          <li>
            The Platform and its services are provided “as is” without any warranties, express or
            implied, including but not limited to fitness for a particular purpose or non-infringement.
          </li>
          <li>UX4G does not guarantee that the Platform will be error-free, secure, or uninterrupted.</li>
          <li>UX4G shall not be liable for any direct, indirect, incidental, or consequential damages resulting from the use or inability to use the Platform.</li>
          <li>Users agree to indemnify UX4G against any claims, damages, or expenses arising from their misuse of the Platform.</li>
        </ul>

        <h2 id="third-party">Third-party links</h2>
        <p>
          The Platform may contain links to third-party websites. UX4G is not responsible for the
          content, accuracy, or practices of such external sites.
        </p>

        <h2 id="termination">Termination</h2>
        <p>
          UX4G reserves the right to suspend or terminate user access to the Platform at its discretion,
          without prior notice, for any violation of these terms.
        </p>

        <h2 id="law">Governing law</h2>
        <p>
          These terms shall be governed by and construed in accordance with the laws of India. Disputes
          arising under these terms will be subject to the exclusive jurisdiction of courts in India.
        </p>

        <h2 id="contact">Contact</h2>
        <p>
          For any questions or concerns regarding these terms, please contact us at{" "}
          <a href="mailto:support.ux4g@digitalindia.gov.in">support.ux4g@digitalindia.gov.in</a>.
        </p>
        </div>
        <OnThisPage sections={SECTIONS} />
      </div>
    </PublicShell>
  );
}
