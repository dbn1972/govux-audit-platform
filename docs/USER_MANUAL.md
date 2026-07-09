# GovUX Audit Platform — User Manual

A practical guide for everyone who uses the platform: citizens using the free
scanner, nodal officers, expert assessors, and programme administrators (MeitY/NIC).

---

## Contents
1. [What GovUX does](#1-what-govux-does)
2. [Understanding the GovUX Score](#2-understanding-the-govux-score)
3. [Free public scanner (no sign-in)](#3-free-public-scanner-no-sign-in)
4. [Signing in](#4-signing-in)
5. [Registering & verifying a domain](#5-registering--verifying-a-domain)
6. [Running an audit](#6-running-an-audit)
7. [Reading the report](#7-reading-the-report)
8. [Prioritised issues & remediation](#8-prioritised-issues--remediation)
9. [Expert review & certification (assessors)](#9-expert-review--certification-assessors)
10. [National oversight (programme admins)](#10-national-oversight-programme-admins)
11. [Platform configuration (admins)](#11-platform-configuration-admins)
12. [Roles & permissions](#12-roles--permissions)
13. [Glossary](#13-glossary)
14. [FAQ](#14-faq)

---

## 1. What GovUX does

GovUX measures how good a government website is — for real citizens — and whether
it meets India's standards. It combines four things into **one 0–100 score**:

- **GIGW 3.0** — Guidelines for Indian Government Websites (mandatory elements).
- **WCAG 2.2 AA** — the accessibility standard.
- **UX4G** — the government design system.
- **Core Web Vitals** — real-world speed and stability.

It works only on **`.gov.in` and `.nic.in`** websites.

---

## 2. Understanding the GovUX Score

Your site gets a **score from 0 to 100** and a **band from A to E**:

| Band | Score | Meaning |
|:--:|:--:|---|
| **A** | 90–100 | Exemplary |
| **B** | 75–89 | Good |
| **C** | 60–74 | Needs work |
| **D** | 40–59 | Poor |
| **E** | 0–39 | Critical |

The score is a **weighted average of 8 categories** (Accessibility 22%, Usability
17%, GIGW 15%, Performance 12%, Design 11%, Responsiveness 10%, Content 7%, Trust
6%). It is **deterministic** — the same website audited with the same engine always
gets the same score, so it's fair and defensible.

**Guard-rail:** if Accessibility or Trust falls below 50, your band is **capped at
C** no matter how high the average — because a site that citizens can't access
isn't a "B" site.

**Two separate verdicts — important:**
- The **UX band (A–E)** is an aspirational quality score.
- The **compliance status** is a *legal* verdict, shown separately:
  `non_compliant` → `partially_compliant` → `compliant`.
  An automated scan alone can reach **at most `partially_compliant`** — a full
  `compliant` verdict requires an **expert review** (see §9). This is deliberate:
  automated tools catch only ~30–40% of accessibility issues.

---

## 3. Free public scanner (no sign-in)

Anyone can scan a single page for free — no account needed.

1. Go to the home page (**/scan**).
2. Enter a `.gov.in` or `.nic.in` URL and click **Scan free**.
3. If others are scanning, you'll see your **position in the queue**.
4. When it finishes, view the score card and **download the PDF report**.

**Limits & fairness:** each visitor gets a few free scans per day; beyond that
you'll be asked to solve a quick **CAPTCHA**. To scan multiple pages, save reports,
and track history over time, **sign in** with a government email.

---

## 4. Signing in

GovUX uses **one-time passwords (OTP)** — there is no password to remember.

1. Click **Sign in** and enter your **official government email** (must end in
   `.gov.in` or `.nic.in`).
2. Click **Send OTP**. A 6-digit code is emailed to you (valid 5 minutes).
3. Enter the code and click **Verify & sign in**.

**Device binding:** when you verify, your session is tied to *this* device. A
stolen session cookie won't work elsewhere. For your security:
- After **3 failed attempts**, sign-in is locked for **10 minutes**.
- A further failure adds a **CAPTCHA and a 20-minute lock**.

Your session stays signed in and refreshes automatically. To sign out, use the
account menu.

---

## 5. Registering & verifying a domain

Before you can audit a site, you must **prove you own the domain**.

1. Go to **My Domains → Add domain**.
2. Enter the `.gov.in`/`.nic.in` URL, and (optionally) its service category and
   size class. Click **Register**.
3. You'll receive a **verification token**. Prove ownership by one of:
   - **DNS TXT** — add the token as a TXT record on the domain.
   - **File upload** — place the token file at the shown `.well-known` path.
   - **SSO mapping** — for domains linked via government single sign-on.
4. Click **Verify**. On success, the domain shows **Verified** and can be audited.

> Ownership is proven cryptographically — there is no auto-pass.

---

## 6. Running an audit

1. Go to **New Audit** (or click **Run audit** next to a verified domain).
2. Choose the **page depth** (how many pages to crawl), **devices**, and
   **browsers**. Registered users may scan up to 10 pages for free; more requires
   **admin approval**.
3. Click **Start**. The audit runs **in the background** — you'll see it move
   through **crawling → analyzing → scoring**. You can leave the page and come back.
4. When it reaches **completed**, open the report.

**What the engine does:** it renders your pages in **three real browsers**
(Chrome, Firefox, Safari/WebKit), runs **axe-core** for accessibility, **Lighthouse**
for speed, checks **GIGW mandatory elements**, tests **4 screen sizes** and
**tap-target** sizes, inspects **security headers**, checks **Indic-language**
handling, and audits any **linked PDFs**.

---

## 7. Reading the report

The report opens on the **score card**:

- **Big number + band** (e.g. `67.1 · Band C`), with a note if the guard-rail is
  active.
- **Issues by severity** — critical / high / medium / low counts.
- **Category sub-scores** — a bar per category showing exactly where points were
  won and lost. Green = strong, amber = fair, red = weak.
- **Compliance** — the separate legal verdict and its confidence
  (`automated_only` until an expert reviews it).

From the report you can jump to:
- **Prioritised issues** (§8)
- **Responsiveness & compatibility** — the cross-browser matrix (does it load /
  overflow / break images in each engine).
- **Score trend & history** — how the score changed across re-audits.
- **Document accessibility** — results for linked PDFs.
- **Certify (expert review)** — for assessors (§9).

Every report is **downloadable as a PDF** (registered users' PDFs are kept in
secure storage).

---

## 8. Prioritised issues & remediation

- **Prioritised issues** lists every finding, ranked by severity, filterable by
  critical/high/medium/low, each tagged with the guideline it maps to (e.g.
  `WCAG2AA`, `GIGW`).
- **Remediation plan** orders fixes by **impact × effort** — highest-value,
  lowest-cost first — and gives each a **plain-language fix** and a **code hint**.
  A `P` number shows the priority.

> The ordering uses a deterministic impact/effort model; an optional ML overlay
> may add an advisory priority, but it never changes the score.

Work top-down: fixing the highest-`P` items recovers the most points.

---

## 9. Expert review & certification (assessors)

A full **`compliant`** verdict needs a human. If you have the **assessor** (or
admin) role:

1. Open a **completed** audit report and click **Certify (expert review)**.
2. The review screen shows the audit's **current verdict** and a checklist of items
   automation can't judge (e.g. *is the alt text actually meaningful?*).
3. Mark each item, add **notes**, then:
   - **✓ Certify compliant** — records your sign-off; the verdict is re-derived
     (reaches `compliant` if accessibility is at the AA bar with no critical
     failures).
   - **Reject — needs work** — records `non_compliant` with your reason.
4. Every decision is **audit-logged** with your identity and timestamp.

You cannot certify while a checklist item is marked *fail* — resolve it first.

---

## 10. National oversight (programme admins)

Programme administrators (MeitY/NIC stewards) get an estate-wide view:

- **National Dashboard** — coverage %, national average, band distribution, and top
  performers across all audited domains (counted by each domain's **latest** audit).
- **Ministries & Departments** and **States & UTs** — quality grouped by
  organisation and by state.
- **League Table** — like-for-like rankings *within a service category* (never one
  unfair flat list), with governance-gated public/internal publishing.
- **Estate Discovery** — automatically find an organisation's gov domains.
- **Bulk Scan** — queue many domains at once (rejected if the queue is saturated).
- **Continuous Monitoring** — schedule automatic re-audits.
- **Alerts** — get notified when a site regresses.

---

## 11. Platform configuration (admins)

**Configuration** (programme/super admins only) lets you change platform behaviour
**at runtime, without a redeploy**:

- **Free scanner** — scans per IP, quota window, free pages for registered users.
- **Sign-in security** — lockout thresholds and durations, OTP request limits.
- **CAPTCHA** — enable/disable, provider, secret.
- **Email / OTP delivery** — provider (console/SMTP/API), from-address, SMTP
  settings; a **Send test email** button to validate.
- **Monitoring / Prometheus** — expose `/metrics`, its token, and the dashboard
  cache TTL.

Secrets are **write-only** (shown as `••••••`, encrypted at rest). Every change is
**audit-logged**. A **Live health** panel shows real-time cache hit-rate, queue
depth, dead-letter count, and DB pool usage.

---

## 12. Roles & permissions

| Role | Can do |
|---|---|
| **owner** | Manage their org's domains, run audits, view reports |
| **contributor** | Run audits, view reports |
| **assessor** | The above + **certify** audits (expert review) |
| **programme_admin** | The above + national dashboards, bulk scan, discovery, monitoring, **configuration** |
| **super_admin** | Full access, including cross-organisation |

Officers only ever see **their own organisation's** audits — cross-department data
is never visible (enforced in code).

---

## 13. Glossary

- **GIGW 3.0** — Guidelines for Indian Government Websites.
- **WCAG 2.2 AA** — Web Content Accessibility Guidelines, level AA.
- **UX4G** — the Government of India design system.
- **Core Web Vitals (CWV)** — LCP (load), CLS (stability), INP/TBT (interactivity).
- **Band** — the A–E grade derived from the score.
- **Guard-rail** — the rule capping the band at C on critical a11y/trust failures.
- **Compliance status** — the separate legal verdict (non/partially/compliant).
- **Nodal officer** — the person responsible for a department's website.
- **Assessor** — an expert who performs manual review and certification.

---

## 14. FAQ

**Why is my compliance "partially_compliant" even with a high score?**
Because it was an automated scan. Automation can't verify everything (e.g. whether
alt text is *meaningful*). Ask an assessor to certify it (§9).

**Why did my A-grade site get capped at C?**
The guard-rail: Accessibility or Trust scored below 50. Fix those first.

**Can I scan a non-gov site?**
No. GovUX only accepts `.gov.in` / `.nic.in` domains.

**My audit is stuck on "crawling" for a while.**
Multi-page audits across three browsers take a few minutes. If a site blocks
automated traffic (WAF), the crawl may return fewer pages — coverage is shown on
the report so results stay honest.

**Where did my downloaded report go?**
Anonymous scan PDFs are temporary. Sign in to keep durable copies of your reports.

**I got an unexpected error.**
Note the **reference id** shown in the message and report it via the
[bug template](../.github/ISSUE_TEMPLATE/bug_report.md) — it helps support trace the
exact request. For anything security-related, follow [SECURITY.md](../SECURITY.md).
