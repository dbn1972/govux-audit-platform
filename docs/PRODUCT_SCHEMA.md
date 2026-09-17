# GovUX Audit Platform — Product Schema

> Canonical source: `platform/db/schema.sql` (v1.1)
> ORM mirror: `platform/backend/app/models.py`
> Database: PostgreSQL 16 + pgvector (`pgvector/pgvector:pg16`)
> Required extensions: `pgcrypto`, `citext`, `vector`

---

## Enums (10)

| Enum | Values | Used by |
|------|--------|---------|
| `user_role` | owner, contributor, assessor, programme_admin, super_admin | `users.role`, `invitations.role` |
| `org_type` | ministry, department, state, ut, psu, other | `organisations.org_type` |
| `verify_method` | dns_txt, file_upload, sso_mapping, steward_override | `domains.verify_method` |
| `verify_status` | pending, verified, failed, superseded | `domains.verify_status` |
| `audit_status` | queued, crawling, analyzing, scoring, completed, partial, failed, cancelled, insufficient_evidence | `audits.status` |
| `page_status` | discovered, analysed, timed_out, skipped, error | `audit_pages.status` |
| `severity` | critical, high, medium, low | `findings.severity` |
| `finding_state` | open, in_progress, resolved, not_applicable | `findings.state` |
| `band` | A, B, C, D, E | `audits.band` |
| `publish_mode` | internal, public | `ranking_publications.mode` |

---

## Tables (22)

### 1. organisations

Represents a government body (ministry, department, state/UT, PSU).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | |
| name | TEXT | NOT NULL | Organisation name |
| org_type | org_type | NOT NULL | ministry / department / state / ut / psu / other |
| parent_id | UUID | FK -> organisations(id) | Hierarchy (ministry -> department) |
| state_code | TEXT | | For state/UT segmentation in rankings |
| studio_enabled | BOOLEAN | NOT NULL, default false | GovUX Studio entitlement (super_admin approved) |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | |

---

### 2. users

Government officers. Passwordless — authentication is email OTP only.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | |
| email | CITEXT | UNIQUE, NOT NULL, CHECK `~* '[@.](gov\|nic)\.in$'` | Only .gov.in / .nic.in accepted |
| org_id | UUID | FK -> organisations(id) | Null until first domain registration |
| display_name | TEXT | | |
| role | user_role | NOT NULL, default 'owner' | |
| is_active | BOOLEAN | NOT NULL, default true | |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | |
| last_login_at | TIMESTAMPTZ | | |

---

### 3. otp_codes

Short-lived, single-use one-time passwords (hashed, never stored in plaintext).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| email | CITEXT | NOT NULL | Target email address |
| code_hash | TEXT | NOT NULL | HMAC-SHA256 hash of the 6-digit code |
| purpose | TEXT | NOT NULL, default 'login' | login / step_up |
| expires_at | TIMESTAMPTZ | NOT NULL | 5 minutes from creation |
| consumed_at | TIMESTAMPTZ | | Set when successfully verified |
| attempts | INT | NOT NULL, default 0 | Brute-force counter (max 5) |
| created_ip | INET | | Requesting client's IP |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | |

---

### 4. devices

Trusted device registry for device-bound sessions (DBSC/WebAuthn).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| user_id | UUID | FK -> users(id), ON DELETE CASCADE | |
| device_pubkey | TEXT | NOT NULL | Non-extractable device public key |
| label | TEXT | | "Chrome - Windows" |
| user_agent | TEXT | | |
| last_ip | INET | | |
| last_location | TEXT | | |
| trusted | BOOLEAN | NOT NULL, default true | Revocable by user |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | |
| last_active_at | TIMESTAMPTZ | NOT NULL, default now() | |

---

### 5. sessions

Rotating refresh tokens bound to a device. Family-based reuse detection.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| user_id | UUID | FK -> users(id), ON DELETE CASCADE | |
| device_id | UUID | FK -> devices(id), ON DELETE CASCADE | |
| refresh_token_hash | TEXT | NOT NULL | Hash of current refresh token |
| family_id | UUID | NOT NULL | Rotation family; reuse revokes the family |
| expires_at | TIMESTAMPTZ | NOT NULL | 60-day lifetime |
| revoked_at | TIMESTAMPTZ | | |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | |
| rotated_at | TIMESTAMPTZ | NOT NULL, default now() | |

---

### 6. domains

Government websites registered for auditing. Ownership must be proven.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| org_id | UUID | FK -> organisations(id), NOT NULL | Owning organisation |
| url | TEXT | NOT NULL, CHECK `~* '(\.gov\.in\|\.nic\.in)$'` | e.g. ncsc.dop.gov.in |
| tld | TEXT | NOT NULL | gov.in or nic.in |
| service_category | TEXT | | transactional / information / payments |
| size_class | TEXT | | large / medium / small |
| verify_method | verify_method | | dns_txt / file_upload / sso_mapping / steward_override |
| verify_status | verify_status | NOT NULL, default 'pending' | |
| verify_token | TEXT | | Token to prove ownership |
| created_by | UUID | FK -> users(id) | |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | |

**Unique constraints:**
- `uq_domain_verified_url`: One org owns a URL (partial: WHERE verify_status = 'verified')
- `uq_domain_org_url`: One org can't stack duplicate claims on the same host

---

### 7. audits

The central table. Each row = one async audit job = one dated snapshot.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Also the task_id returned by POST /v1/audits |
| domain_id | UUID | FK -> domains(id), ON DELETE CASCADE | |
| status | audit_status | NOT NULL, default 'queued' | Pipeline state machine |
| scope | JSONB | NOT NULL, default '{}' | Pages/depth/devices/browsers/journeys |
| engine_version | TEXT | NOT NULL | e.g. v3.2 |
| batch_id | UUID | | Set for bulk/estate scans |
| requested_by | UUID | FK -> users(id) | |
| pages_total | INT | NOT NULL, default 0 | |
| pages_done | INT | NOT NULL, default 0 | Progress counter |
| overall_score | NUMERIC(5,2) | | 0-100 GovUX Score |
| band | band | | A/B/C/D/E |
| guardrail_active | BOOLEAN | NOT NULL, default false | Band capped due to low a11y/trust |
| compliance_status | TEXT | | compliant / partially_compliant / non_compliant |
| method | TEXT | NOT NULL, default 'automated' | automated / expert_reviewed |
| confidence | TEXT | NOT NULL, default 'automated_only' | |
| field_data | JSONB | | CrUX real-user metrics |
| anomaly_score | NUMERIC(6,3) | | Advisory ML (NOT in score path) |
| integrity | JSONB | | Integrity Engine result (caps verdict, NOT score) |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | |
| started_at | TIMESTAMPTZ | | |
| finished_at | TIMESTAMPTZ | | |

---

### 8. audit_scores

Per-category scores for each audit. 8 categories, weights sum to 100.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| audit_id | UUID | PK, FK -> audits(id), ON DELETE CASCADE | |
| category | TEXT | PK | accessibility / usability / gigw / design / performance / responsiveness / content / trust |
| weight | NUMERIC(4,1) | NOT NULL | Category weight (sums to 100) |
| score | NUMERIC(5,2) | NOT NULL | Category score (0-100) |

---

### 9. audit_pages

Per-page crawl results and Core Web Vitals.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| audit_id | UUID | FK -> audits(id), ON DELETE CASCADE | |
| url | TEXT | NOT NULL | Page URL |
| status | page_status | NOT NULL, default 'discovered' | |
| device | TEXT | | desktop / mobile |
| lcp_ms | INT | | Largest Contentful Paint (ms) |
| inp_ms | INT | | Interaction to Next Paint (ms) |
| cls | NUMERIC(4,3) | | Cumulative Layout Shift |
| page_score | NUMERIC(5,2) | | Per-page score |
| issue_count | INT | NOT NULL, default 0 | |
| crawled_at | TIMESTAMPTZ | | |

---

### 10. guidelines

The check library. Feeds audits, RAG, and remediation guidance.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | e.g. WCAG-1.4.3, UX4G-TC-001 |
| family | TEXT | NOT NULL | WCAG / GIGW / UX4G / UX4G Handbook / CWV / GovUX |
| category | TEXT | NOT NULL | |
| title | TEXT | NOT NULL | |
| plain_language | TEXT | | Human-readable explanation |
| good_example | TEXT | | A passing example |
| version | TEXT | | |
| issue | TEXT | | Failure mode description |
| advice | TEXT | | How to fix |
| bad_example | TEXT | | A failing example |
| enforcement_level | TEXT | | Foundational / Optimizing / Advanced |
| severity | TEXT | | |
| automation | TEXT | | automated / assisted / manual |
| roles | TEXT | | Developer / Designer / Content |
| source | TEXT | | |
| reference | TEXT | | |
| applies_website | BOOLEAN | NOT NULL, default true | |
| applies_app | BOOLEAN | NOT NULL, default true | |
| embedding | vector(768) | | Optional pgvector embedding for RAG |

---

### 11. manual_assessments

Standalone reviews without an engine run (unreachable domains, mobile apps).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| org_id | UUID | FK -> organisations(id), NOT NULL | |
| domain_id | UUID | FK -> domains(id), ON DELETE SET NULL | Null for apps |
| subject | TEXT | NOT NULL | Domain URL or app name |
| platform | TEXT | NOT NULL, default 'website' | website / app |
| status | TEXT | NOT NULL, default 'in_progress' | in_progress / signed_off |
| verdict | TEXT | | Compliance verdict |
| notes | TEXT | | |
| created_by | UUID | FK -> users(id) | |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | |
| signed_off_at | TIMESTAMPTZ | | |

---

### 12. review_items

Assessor's per-guideline decision for an audit OR a manual assessment.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| audit_id | UUID | FK -> audits(id), ON DELETE CASCADE | Exactly one of audit_id/assessment_id |
| assessment_id | UUID | FK -> manual_assessments(id), ON DELETE CASCADE | |
| guideline_id | TEXT | FK -> guidelines(id), ON DELETE RESTRICT, NOT NULL | |
| decision | TEXT | NOT NULL, CHECK IN ('pass','fail','not_applicable') | |
| note | TEXT | | Assessor's reasoning |
| decided_by | UUID | FK -> users(id), NOT NULL | |
| decided_at | TIMESTAMPTZ | NOT NULL, default now() | |

**Constraint:** `chk_review_item_subject` — exactly one of audit_id/assessment_id must be set.

---

### 13. findings

Individual issues discovered during an audit.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| audit_id | UUID | FK -> audits(id), ON DELETE CASCADE | |
| page_id | UUID | FK -> audit_pages(id), ON DELETE SET NULL | |
| guideline_id | TEXT | | Free-form tag (NOT an FK — engine tags need no migration) |
| category | TEXT | NOT NULL | |
| severity | severity | NOT NULL | critical / high / medium / low |
| effort | TEXT | | low / medium / high |
| element | TEXT | | CSS selector / snippet |
| evidence_ref | TEXT | | Object-store key (screenshot/HAR) |
| state | finding_state | NOT NULL, default 'open' | |
| is_reviewed | BOOLEAN | NOT NULL, default false | automated vs assessor-confirmed |
| confidence | TEXT | NOT NULL, default 'automated' | automated / needs_review / confirmed |
| remediation | TEXT | | Advisory fix guidance (out of score path) |
| title | TEXT | | |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | |

---

### 14. audit_documents

PDF/Office document accessibility results per audit.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| audit_id | UUID | FK -> audits(id), ON DELETE CASCADE | |
| url | TEXT | NOT NULL | Document URL |
| doc_type | TEXT | NOT NULL, default 'pdf' | pdf / docx / xlsx |
| pages | INT | | Page count |
| tagged | BOOLEAN | | Has structure/tags tree |
| has_title | BOOLEAN | | |
| has_lang | BOOLEAN | | |
| score | NUMERIC(5,2) | | Document accessibility score |
| issue_count | INT | NOT NULL, default 0 | |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | |

---

### 15. audit_browsers

Cross-browser compatibility matrix (Chromium / Firefox / WebKit).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| audit_id | UUID | FK -> audits(id), ON DELETE CASCADE | |
| engine | TEXT | NOT NULL | Chromium / Firefox / WebKit |
| loaded | BOOLEAN | | Page loaded successfully |
| status | INT | | HTTP status code |
| js_errors | INT | | JavaScript error count |
| console_errors | INT | | Console error count |
| overflow | BOOLEAN | | Layout overflow detected |
| broken_images | INT | | Broken image count |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | |

---

### 16. schedules

Continuous monitoring — recurring audit runs.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| domain_id | UUID | FK -> domains(id), ON DELETE CASCADE | |
| cadence | TEXT | NOT NULL, default 'weekly' | daily / weekly / monthly |
| enabled | BOOLEAN | NOT NULL, default true | |
| next_run_at | TIMESTAMPTZ | NOT NULL | |
| last_run_at | TIMESTAMPTZ | | |
| created_by | UUID | FK -> users(id) | |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | |

---

### 17. discovered_domains

Auto-discovered estate domains (sitemap/robots/crawl).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| url | TEXT | UNIQUE, NOT NULL | |
| source | TEXT | | sitemap / robots / crawl / registry |
| seed | TEXT | | Where it was found |
| imported | BOOLEAN | NOT NULL, default false | Promoted into domains table |
| discovered_at | TIMESTAMPTZ | NOT NULL, default now() | |

---

### 18. ranking_publications

Governance-gated publication of segmented rankings.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| segment | JSONB | NOT NULL | {category, size_class, org_scope} |
| mode | publish_mode | NOT NULL, default 'internal' | internal / public |
| approved_by | UUID | FK -> users(id) | Required for publication |
| methodology_version | TEXT | NOT NULL | |
| published_at | TIMESTAMPTZ | | |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | |

---

### 19. public_scans

Free anonymous single-URL scans.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| url | TEXT | NOT NULL | Target URL |
| host | TEXT | | Extracted hostname |
| status | TEXT | NOT NULL, default 'queued' | queued / running / completed / failed |
| requested_by | UUID | FK -> users(id) | NULL = anonymous |
| overall_score | NUMERIC(5,2) | | |
| band | TEXT | | |
| pdf_key | TEXT | | S3/MinIO object key (registered users) |
| ip | INET | | Requester's IP |
| error | TEXT | | |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | |
| started_at | TIMESTAMPTZ | | |
| finished_at | TIMESTAMPTZ | | |

---

### 20. scan_requests

Page-quota escalation requests (>10 pages needs admin approval).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| user_id | UUID | FK -> users(id), NOT NULL | |
| domain_id | UUID | FK -> domains(id) | |
| requested_pages | INT | NOT NULL | |
| reason | TEXT | | |
| status | TEXT | NOT NULL, default 'pending' | pending / approved / rejected |
| decided_by | UUID | FK -> users(id) | |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | |
| decided_at | TIMESTAMPTZ | | |

---

### 21. app_settings

Runtime configuration (admin-editable, overrides env defaults).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| key | TEXT | PK | Setting name |
| value | TEXT | | Current value (secrets encrypted via secretbox) |
| updated_by | UUID | FK -> users(id) | Last editor |
| updated_at | TIMESTAMPTZ | NOT NULL, default now() | |

---

### 22. notifications

In-app notification log (complement to email push).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| user_id | UUID | FK -> users(id), ON DELETE CASCADE | |
| kind | TEXT | NOT NULL | audit_complete / regression / approval / ... |
| title | TEXT | NOT NULL | |
| body | TEXT | | |
| link | TEXT | | In-app route |
| read_at | TIMESTAMPTZ | | |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | |

---

### 23. audit_log

Tamper-evident accountability trail.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PK | |
| actor_id | UUID | FK -> users(id) | |
| action | TEXT | NOT NULL | login, otp_verify, audit_submit, publish, role_change, ... |
| target | TEXT | | |
| ip | INET | | |
| device_id | UUID | FK -> devices(id) | |
| detail | JSONB | | |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | |

---

### 24. studio_runs

GovUX Studio AI prototype generation runs (org-fenced, billable).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| org_id | UUID | FK -> organisations(id), NOT NULL | |
| requested_by | UUID | FK -> users(id) | |
| status | TEXT | NOT NULL, default 'generating' | generating / scored / failed |
| inputs | JSONB | NOT NULL, default '{}' | Generation prompt/parameters |
| pages | JSONB | | {filename: html} |
| overall_score | NUMERIC(5,2) | | Score from deterministic engine |
| band | TEXT | | |
| iterations | INT | NOT NULL, default 0 | Refine iterations toward target |
| findings | JSONB | | |
| input_tokens | INT | NOT NULL, default 0 | LLM usage tracking |
| output_tokens | INT | NOT NULL, default 0 | |
| cost_inr | NUMERIC(10,2) | NOT NULL, default 0 | Billing in INR |
| error | TEXT | | |
| published | BOOLEAN | NOT NULL, default false | Public showcase |
| public_slug | TEXT | UNIQUE | |
| published_at | TIMESTAMPTZ | | |
| title | TEXT | | |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | |
| finished_at | TIMESTAMPTZ | | |

---

### 25. external_assessments

Manual-assurance ledger: VAPT, native-app a11y, lived-experience panels, STQC.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| org_id | UUID | FK -> organisations(id), NOT NULL | |
| domain_id | UUID | FK -> domains(id) | |
| kind | TEXT | NOT NULL | vapt / native_app_a11y / lived_experience_panel / stqc_certification / other |
| title | TEXT | NOT NULL | |
| agency | TEXT | | Who performed it |
| assessed_on | DATE | | |
| outcome | TEXT | NOT NULL, default 'in_progress' | passed / failed / partial / in_progress |
| summary | TEXT | | |
| report_ref | TEXT | | File no. / URL / certificate id |
| created_by | UUID | FK -> users(id) | |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | |

---

### 26. invitations

Join an existing organisation (avoids single-person org silos).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| org_id | UUID | FK -> organisations(id), NOT NULL | Target organisation |
| email | CITEXT | NOT NULL, CHECK `~* '[@.](gov\|nic)\.in$'` | Only gov emails |
| role | user_role | NOT NULL, default 'contributor' | Role on acceptance |
| invited_by | UUID | FK -> users(id) | |
| status | TEXT | NOT NULL, default 'pending' | pending / accepted / revoked |
| expires_at | TIMESTAMPTZ | NOT NULL | Default 14 days |
| accepted_at | TIMESTAMPTZ | | |
| accepted_by | UUID | FK -> users(id) | |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | |

**Unique constraint:** `uq_invite_pending_email` — at most one live invite per address (partial: WHERE status = 'pending').

---

## Entity Relationship Diagram (logical)

```
organisations ─┬─< users
               ├─< domains ─< audits ─┬─< audit_scores
               ├─< manual_assessments  ├─< audit_pages
               ├─< studio_runs         ├─< findings
               ├─< external_assessments ├─< audit_documents
               └─< invitations         ├─< audit_browsers
                                        └─< review_items
users ─┬─< devices ─< sessions
       ├─< otp_codes
       ├─< scan_requests
       ├─< notifications
       └─< audit_log

domains ─< schedules
         ─< discovered_domains (independent)
         ─< public_scans (independent)

app_settings (standalone key-value)
ranking_publications (standalone, governance-gated)
```

---

## Key Invariants Enforced at Schema Level

1. **Gov-only access** — CHECK constraints on `users.email`, `domains.url`, and `invitations.email` restrict to `.gov.in` / `.nic.in` only.
2. **Verified ownership uniqueness** — partial unique index ensures only ONE org can hold a verified domain.
3. **Review item exclusivity** — CHECK constraint ensures exactly one of `audit_id` / `assessment_id` is set per review item.
4. **No passwords** — no password column exists anywhere; authentication is OTP-only.
5. **Score separate from verdict** — `audits.overall_score`/`band` (deterministic) and `audits.compliance_status` (legal) are independent columns.

---

## Scoring Model Reference

| Category | Weight |
|----------|--------|
| Accessibility | 22 |
| Usability | 17 |
| GIGW | 15 |
| Performance | 12 |
| Design | 11 |
| Responsiveness | 10 |
| Content | 7 |
| Trust | 6 |
| **Total** | **100** |

**Bands:** A >= 90, B >= 75, C >= 60, D >= 40, E < 40

**Guard-rails:** accessibility < 50 OR trust < 50 -> band capped at C

**Compliance verdict (independent of band):**
- Critical a11y findings or a11y < 50 -> `non_compliant`
- Automated-only -> at most `partially_compliant`
- `compliant` requires: reviewed=True + a11y >= 90 + zero criticals
