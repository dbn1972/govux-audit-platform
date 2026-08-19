import PublicShell from "@/components/PublicShell";
import OnThisPage from "@/components/OnThisPage";

const SECTIONS: [string, string][] = [
  ["collect", "Information we collect"],
  ["use", "How we use it"],
  ["sharing", "Information sharing"],
  ["security", "Data security"],
  ["rights", "Your rights"],
  ["retention", "Retention"],
  ["changes", "Changes to this policy"],
  ["contact", "Contact"],
];

export const metadata = {
  title: "Privacy Policy — GovUX Audit Platform",
  description: "How Audit 360 collects, uses and protects your information.",
};

// Content mirrors audit360.ux4g.gov.in/privacy-policy.
export default function PrivacyPolicy() {
  return (
    <PublicShell>
      <div className="gx-doc-head">
        <h1 className="mb-2">Privacy Policy</h1>
        <p className="gx-lead gx-prose mb-0">
          At Audit 360, an initiative by UX4G, we are committed to safeguarding your privacy. This
          policy explains how we collect, use, and protect your information when you use the Audit 360
          platform (“Platform”). By accessing or using the Platform, you agree to the practices
          described here.
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
            <dt className="gx-label">Questions</dt>
            <dd><a href="mailto:support.ux4g@digitalindia.gov.in">support.ux4g@digitalindia.gov.in</a></dd>
          </div>
        </div>
      </div>

      <div className="gx-doc">
        <div className="gx-prose">

        <h2 id="collect">Information we collect</h2>
        <dl>
          <dt>Personal information</dt>
          <dd>
            When you register or interact with the Platform, we may collect personal information such
            as your name, email address, phone number, and organization details.
          </dd>
          <dt>Usage data</dt>
          <dd>
            We collect data about how you use the Platform, including IP address, browser type,
            operating system, access times, and pages visited.
          </dd>
          <dt>Cookies and tracking technologies</dt>
          <dd>
            The Platform uses cookies and similar technologies to enhance user experience and gather
            analytics data. You can manage cookie preferences through your browser settings.
          </dd>
        </dl>

        <h2 id="use">How we use your information</h2>
        <dl>
          <dt>To provide services</dt>
          <dd>We use your information to deliver, maintain, and improve the functionality and performance of the Platform.</dd>
          <dt>Communication</dt>
          <dd>Your contact information may be used to send service-related communications, updates, and notifications.</dd>
          <dt>Analytics</dt>
          <dd>Usage data helps us analyse trends, optimize the Platform, and ensure its security.</dd>
          <dt>Legal compliance</dt>
          <dd>We may use your information to comply with legal obligations or respond to lawful requests from authorities.</dd>
        </dl>

        <h2 id="sharing">Information sharing</h2>
        <dl>
          <dt>Third-party service providers</dt>
          <dd>
            We may share your information with trusted third-party service providers who assist in
            operating the Platform. These providers are bound by confidentiality agreements.
          </dd>
          <dt>Legal requirements</dt>
          <dd>Information may be disclosed if required by law or in response to valid legal requests.</dd>
          <dt>Consent</dt>
          <dd>We will share your information with third parties only with your explicit consent.</dd>
        </dl>

        <h2 id="security">Data security</h2>
        <ul>
          <li>
            We employ industry-standard security measures to protect your data from unauthorized
            access, alteration, or destruction.
          </li>
          <li>
            Despite our efforts, no method of transmission over the internet or electronic storage is
            100% secure. Users are advised to take precautions when sharing information online.
          </li>
        </ul>

        <h2 id="rights">Your rights</h2>
        <dl>
          <dt>Access and correction</dt>
          <dd>You have the right to access and request correction of your personal data stored on the Platform.</dd>
          <dt>Opt-out</dt>
          <dd>You can opt out of receiving non-essential communications by contacting us.</dd>
          <dt>Data deletion</dt>
          <dd>You may request the deletion of your personal data, subject to applicable legal obligations.</dd>
        </dl>

        <h2 id="retention">Retention of data</h2>
        <p>
          We retain your data for as long as necessary to fulfil the purposes outlined in this Privacy
          Policy or as required by law.
        </p>

        <h2 id="changes">Changes to this policy</h2>
        <p>
          This Privacy Policy may be updated periodically to reflect changes in practices or legal
          requirements. Continued use of the Platform constitutes acceptance of the revised policy.
        </p>

        <h2 id="contact">Contact</h2>
        <p>
          If you have questions or concerns regarding this Privacy Policy, please contact us at{" "}
          <a href="mailto:support.ux4g@digitalindia.gov.in">support.ux4g@digitalindia.gov.in</a>.
        </p>
        </div>
        <OnThisPage sections={SECTIONS} />
      </div>
    </PublicShell>
  );
}
