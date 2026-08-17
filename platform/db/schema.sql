-- ============================================================
-- GovUX Audit Platform — PostgreSQL schema (v1.1)
-- Aligned to BRD v1.1: async audit jobs, 8-category scoring,
-- email-OTP + device-bound sessions, bulk scan, segmented ranking.
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";         -- case-insensitive email/url
CREATE EXTENSION IF NOT EXISTS "vector";         -- pgvector (guideline RAG); optional

-- ---------- enums ----------
CREATE TYPE user_role      AS ENUM ('owner','contributor','assessor','programme_admin','super_admin');
CREATE TYPE org_type       AS ENUM ('ministry','department','state','ut','psu','other');
-- steward_override: ownership was NOT proven — a programme admin vouched for it
-- out of band. Kept distinct from sso_mapping (Parichay) so "never actually
-- proven" stays queryable.
CREATE TYPE verify_method  AS ENUM ('dns_txt','file_upload','sso_mapping','steward_override');
CREATE TYPE verify_status  AS ENUM ('pending','verified','failed','superseded');
CREATE TYPE audit_status   AS ENUM ('queued','crawling','analyzing','scoring','completed','partial','failed','cancelled','insufficient_evidence');
CREATE TYPE page_status    AS ENUM ('discovered','analysed','timed_out','skipped','error');
CREATE TYPE severity       AS ENUM ('critical','high','medium','low');
CREATE TYPE finding_state  AS ENUM ('open','in_progress','resolved','not_applicable');
CREATE TYPE band           AS ENUM ('A','B','C','D','E');
CREATE TYPE publish_mode   AS ENUM ('internal','public');

-- ---------- organisations ----------
CREATE TABLE organisations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    org_type     org_type NOT NULL,
    parent_id    UUID REFERENCES organisations(id),
    state_code   TEXT,                              -- for state/UT segmentation
    studio_enabled BOOLEAN NOT NULL DEFAULT false,  -- GovUX Studio entitlement (super_admin approved)
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_org_parent ON organisations(parent_id);

-- ---------- users (email-OTP; no passwords stored) ----------
CREATE TABLE users (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email        CITEXT UNIQUE NOT NULL,
    org_id       UUID REFERENCES organisations(id),
    display_name TEXT,
    role         user_role NOT NULL DEFAULT 'owner',
    is_active    BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ,
    -- enforce gov.in / nic.in only (bare domain or any subdomain), at the DB layer too
    CONSTRAINT chk_gov_email CHECK (email ~* '[@.](gov|nic)\.in$')
);

-- ---------- OTP codes (hashed, short TTL, single-use) ----------
CREATE TABLE otp_codes (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email        CITEXT NOT NULL,
    code_hash    TEXT NOT NULL,                     -- hash of the 6-digit OTP
    purpose      TEXT NOT NULL DEFAULT 'login',     -- login | step_up
    expires_at   TIMESTAMPTZ NOT NULL,
    consumed_at  TIMESTAMPTZ,
    attempts     INT NOT NULL DEFAULT 0,
    created_ip   INET,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_otp_email ON otp_codes(email, created_at DESC);

-- ---------- trusted devices (device-bound sessions) ----------
CREATE TABLE devices (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_pubkey TEXT NOT NULL,                    -- non-extractable device public key (DBSC/WebAuthn)
    label         TEXT,                             -- "Chrome · Windows"
    user_agent    TEXT,
    last_ip       INET,
    last_location TEXT,
    trusted       BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_device_user ON devices(user_id);

-- ---------- sessions (rotating refresh tokens, bound to a device) ----------
CREATE TABLE sessions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id          UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL,               -- hash of current refresh token
    family_id          UUID NOT NULL,               -- rotation family; reuse detection revokes the family
    expires_at         TIMESTAMPTZ NOT NULL,
    revoked_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    rotated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_session_user ON sessions(user_id);
CREATE INDEX idx_session_family ON sessions(family_id);

-- ---------- domains ----------
CREATE TABLE domains (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id         UUID NOT NULL REFERENCES organisations(id),
    -- NOT globally unique: several organisations may hold a PENDING claim on
    -- the same host and race to prove ownership. A global UNIQUE made this
    -- first-come-first-served — anyone could register a domain they did not
    -- own, never verify it, and permanently block the real owner (409, with
    -- no release path). Uniqueness belongs on proven ownership; see the
    -- partial index below.
    url            TEXT NOT NULL,                    -- e.g. ncsc.dop.gov.in
    tld            TEXT NOT NULL,                    -- gov.in | nic.in
    service_category TEXT,                           -- transactional | information | payments ...
    size_class     TEXT,                             -- large | medium | small (for segmentation)
    verify_method  verify_method,
    verify_status  verify_status NOT NULL DEFAULT 'pending',
    verify_token   TEXT,
    created_by     UUID REFERENCES users(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_gov_domain CHECK (url ~* '(\.gov\.in|\.nic\.in)$')
);
CREATE INDEX idx_domain_org ON domains(org_id);
-- exactly ONE organisation may hold a host once ownership is proven; losing
-- claims are marked 'superseded' so they fall out of this index
CREATE UNIQUE INDEX uq_domain_verified_url ON domains(url) WHERE verify_status = 'verified';
-- and one organisation cannot stack duplicate claims on the same host
CREATE UNIQUE INDEX uq_domain_org_url ON domains(org_id, url);

-- ---------- audits (each run = an async job = a dated snapshot) ----------
CREATE TABLE audits (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- the task_id
    domain_id      UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    status         audit_status NOT NULL DEFAULT 'queued',
    scope          JSONB NOT NULL DEFAULT '{}',      -- pages/depth/devices/browsers/journeys
    engine_version TEXT NOT NULL,
    batch_id       UUID,                             -- set for bulk/estate scans
    requested_by   UUID REFERENCES users(id),
    pages_total    INT NOT NULL DEFAULT 0,
    pages_done     INT NOT NULL DEFAULT 0,
    overall_score  NUMERIC(5,2),
    band           band,
    guardrail_active BOOLEAN NOT NULL DEFAULT false,
    -- legal compliance verdict, kept SEPARATE from the UX band (gap G1)
    compliance_status TEXT,                          -- compliant | partially_compliant | non_compliant
    method         TEXT NOT NULL DEFAULT 'automated',-- automated | expert_reviewed (two-tier methodology)
    confidence     TEXT NOT NULL DEFAULT 'automated_only',
    field_data     JSONB,                            -- CrUX real-user metrics blended into performance (gap G4)
    anomaly_score  NUMERIC(6,3),                     -- advisory ML (IsolationForest); NOT in the score path
    integrity      JSONB,                            -- Integrity Engine result (anti-gaming); caps verdict, NOT the score
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at     TIMESTAMPTZ,
    finished_at    TIMESTAMPTZ
);
CREATE INDEX idx_audit_domain_time ON audits(domain_id, created_at DESC);
CREATE INDEX idx_audit_status ON audits(status);
CREATE INDEX idx_audit_batch ON audits(batch_id);

-- ---------- category scores (8 categories per audit) ----------
CREATE TABLE audit_scores (
    audit_id   UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
    category   TEXT NOT NULL,                        -- accessibility | usability | gigw | design | performance | responsiveness | content | trust
    weight     NUMERIC(4,1) NOT NULL,
    score      NUMERIC(5,2) NOT NULL,
    PRIMARY KEY (audit_id, category)
);

-- ---------- per-page coverage ----------
CREATE TABLE audit_pages (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id     UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
    url          TEXT NOT NULL,
    status       page_status NOT NULL DEFAULT 'discovered',
    device       TEXT,
    lcp_ms       INT,
    inp_ms       INT,
    cls          NUMERIC(4,3),
    page_score   NUMERIC(5,2),
    issue_count  INT NOT NULL DEFAULT 0,
    crawled_at   TIMESTAMPTZ
);
CREATE INDEX idx_page_audit ON audit_pages(audit_id);

-- ---------- guideline library (checks; feeds RAG + guidance) ----------
CREATE TABLE guidelines (
    id           TEXT PRIMARY KEY,                   -- e.g. WCAG-1.4.3, UX4G-TC-001
    family       TEXT NOT NULL,                      -- WCAG | GIGW | UX4G | CWV
    category     TEXT NOT NULL,
    title        TEXT NOT NULL,
    plain_language TEXT,
    good_example TEXT,                               -- a passing example
    version      TEXT,
    -- review-facing detail (mirrors the UX4G v3.0.0 mastersheet). A reviewer
    -- needs the failure mode and the fix, not just a title.
    issue             TEXT,
    advice            TEXT,
    bad_example       TEXT,
    enforcement_level TEXT,                          -- Foundational | Optimizing | Advanced
    severity          TEXT,
    automation        TEXT,                          -- automated | assisted | manual
    roles             TEXT,                          -- Developer | Designer | Content
    source            TEXT,
    reference         TEXT,
    embedding    vector(768)                         -- optional, pgvector
);
CREATE INDEX ix_guidelines_automation  ON guidelines(automation);
CREATE INDEX ix_guidelines_enforcement ON guidelines(enforcement_level);

-- ---------- guided manual review ----------
-- One assessor decision per guideline per audit. Without this the review
-- screen's per-item answers lived only in browser state and were lost on
-- navigation, leaving a legal verdict with no recorded reasoning behind it.
CREATE TABLE review_items (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id     UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
    guideline_id TEXT NOT NULL REFERENCES guidelines(id) ON DELETE RESTRICT,
    decision     TEXT NOT NULL,
    note         TEXT,
    decided_by   UUID NOT NULL REFERENCES users(id),
    decided_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_review_item UNIQUE (audit_id, guideline_id),
    CONSTRAINT chk_review_decision CHECK (decision IN ('pass','fail','not_applicable'))
);
CREATE INDEX ix_review_items_audit ON review_items(audit_id);

-- ---------- findings ----------
CREATE TABLE findings (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id     UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
    page_id      UUID REFERENCES audit_pages(id) ON DELETE SET NULL,
    -- free-form check tag from the engine (axe/GIGW); intentionally NOT an FK —
    -- engine tags need not exist in the curated guideline library
    guideline_id TEXT,
    category     TEXT NOT NULL,
    severity     severity NOT NULL,
    effort       TEXT,                               -- low | medium | high
    element      TEXT,                               -- selector / snippet
    evidence_ref TEXT,                               -- object-store key (screenshot/HAR)
    state        finding_state NOT NULL DEFAULT 'open',
    is_reviewed  BOOLEAN NOT NULL DEFAULT false,     -- automated vs assessor-confirmed
    confidence   TEXT NOT NULL DEFAULT 'automated',  -- automated | needs_review | confirmed (gap G1)
    remediation  TEXT,                               -- advisory fix guidance (gap G5, out of score path)
    title        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_finding_audit ON findings(audit_id, severity);

-- ---------- document (PDF/Office) accessibility per audit (gap G3) ----------
CREATE TABLE audit_documents (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id     UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
    url          TEXT NOT NULL,
    doc_type     TEXT NOT NULL DEFAULT 'pdf',        -- pdf | docx | xlsx
    pages        INT,
    tagged       BOOLEAN,                            -- has a structure/tags tree
    has_title    BOOLEAN,
    has_lang     BOOLEAN,
    score        NUMERIC(5,2),
    issue_count  INT NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_doc_audit ON audit_documents(audit_id);

-- ---------- cross-browser matrix per audit (Chromium/Firefox/WebKit) ----------
CREATE TABLE audit_browsers (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id       UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
    engine         TEXT NOT NULL,                    -- Chromium | Firefox | WebKit (Safari/iOS)
    loaded         BOOLEAN,
    status         INT,
    js_errors      INT,
    console_errors INT,
    overflow       BOOLEAN,
    broken_images  INT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_browser_audit ON audit_browsers(audit_id);

-- ---------- scheduled continuous monitoring (gap G2) ----------
CREATE TABLE schedules (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id    UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    cadence      TEXT NOT NULL DEFAULT 'weekly',     -- daily | weekly | monthly
    enabled      BOOLEAN NOT NULL DEFAULT true,
    next_run_at  TIMESTAMPTZ NOT NULL,
    last_run_at  TIMESTAMPTZ,
    created_by   UUID REFERENCES users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_schedule_due ON schedules(enabled, next_run_at);

-- ---------- auto-discovered estate domains (gap G2 / auto-discovery) ----------
CREATE TABLE discovered_domains (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url          TEXT UNIQUE NOT NULL,
    source       TEXT,                               -- sitemap | robots | crawl | registry
    seed         TEXT,                               -- where it was found
    imported     BOOLEAN NOT NULL DEFAULT false,     -- promoted into domains yet?
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- rankings / publication (segmented, governance-gated) ----------
CREATE TABLE ranking_publications (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    segment      JSONB NOT NULL,                     -- {category, size_class, org_scope}
    mode         publish_mode NOT NULL DEFAULT 'internal',
    approved_by  UUID REFERENCES users(id),
    methodology_version TEXT NOT NULL,
    published_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- free public single-URL scans (anonymous or registered) ----------
CREATE TABLE public_scans (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url           TEXT NOT NULL,
    host          TEXT,
    status        TEXT NOT NULL DEFAULT 'queued',   -- queued | running | completed | failed
    requested_by  UUID REFERENCES users(id),        -- NULL = anonymous
    overall_score NUMERIC(5,2),
    band          TEXT,
    pdf_key       TEXT,                              -- S3/MinIO object key (registered users)
    ip            INET,
    error         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at    TIMESTAMPTZ,
    finished_at   TIMESTAMPTZ
);
CREATE INDEX idx_pubscan_status ON public_scans(status, created_at);
CREATE INDEX idx_pubscan_host   ON public_scans(host);

-- ---------- page-quota escalation requests (>10 pages needs admin approval) ----------
CREATE TABLE scan_requests (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id),
    domain_id     UUID REFERENCES domains(id),
    requested_pages INT NOT NULL,
    reason        TEXT,
    status        TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
    decided_by    UUID REFERENCES users(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at    TIMESTAMPTZ
);
CREATE INDEX idx_scanreq_user ON scan_requests(user_id, status);

-- ---------- runtime configuration (admin-editable; overrides env defaults) ----------
CREATE TABLE app_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT,
    updated_by  UUID REFERENCES users(id),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- audit log (tamper-evident accountability) ----------
CREATE TABLE audit_log (
    id           BIGSERIAL PRIMARY KEY,
    actor_id     UUID REFERENCES users(id),
    action       TEXT NOT NULL,                      -- login, otp_verify, audit_submit, publish, role_change ...
    target       TEXT,
    ip           INET,
    device_id    UUID REFERENCES devices(id),
    detail       JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_log_actor_time ON audit_log(actor_id, created_at DESC);

-- ---------- foreign-key & sort indexes ----------
-- Index every FK used in joins/reporting, plus a partial index for the league /
-- rankings sort over completed audits (ORDER BY overall_score).
CREATE INDEX IF NOT EXISTS idx_users_org            ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_domain_created_by    ON domains(created_by);
CREATE INDEX IF NOT EXISTS idx_audit_requested_by   ON audits(requested_by);
CREATE INDEX IF NOT EXISTS idx_session_device       ON sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_log_device           ON audit_log(device_id);
CREATE INDEX IF NOT EXISTS idx_scanreq_domain       ON scan_requests(domain_id);
CREATE INDEX IF NOT EXISTS idx_scanreq_decider      ON scan_requests(decided_by);
CREATE INDEX IF NOT EXISTS idx_audit_completed_score
    ON audits(overall_score DESC) WHERE status = 'completed';

-- ---------- GovUX Studio (AI prototype generator) ----------
-- One row per generation run. Org-fenced; billable (token counts + cost). The
-- LLM only generates the pages; the deterministic studio auditor scores them.
CREATE TABLE IF NOT EXISTS studio_runs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL REFERENCES organisations(id),
    requested_by  UUID REFERENCES users(id),
    status        TEXT NOT NULL DEFAULT 'generating',    -- generating | scored | failed
    inputs        JSONB NOT NULL DEFAULT '{}'::jsonb,
    pages         JSONB,                                  -- {filename: html}
    overall_score NUMERIC(5,2),
    band          TEXT,
    iterations    INTEGER NOT NULL DEFAULT 0,
    findings      JSONB,
    input_tokens  INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_inr      NUMERIC(10,2) NOT NULL DEFAULT 0,
    error         TEXT,
    published     BOOLEAN NOT NULL DEFAULT false,   -- public showcase
    public_slug   TEXT UNIQUE,
    published_at  TIMESTAMPTZ,
    title         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_studio_org_time ON studio_runs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_studio_slug ON studio_runs(public_slug) WHERE published;

-- ---------- External assessments (G9 / G11 / G13 manual-assurance ledger) ----------
-- Records of assurance work automation cannot produce: CERT-In empanelled VAPT,
-- native mobile-app accessibility audits, lived-experience (disabled-user) panel
-- reviews and STQC certification outcomes. Advisory evidence only — surfaced in
-- the evidence pack and compliance views, never part of the deterministic score.
CREATE TABLE IF NOT EXISTS external_assessments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       UUID NOT NULL REFERENCES organisations(id),
    domain_id    UUID REFERENCES domains(id),
    kind         TEXT NOT NULL,                     -- vapt | native_app_a11y | lived_experience_panel | stqc_certification | other
    title        TEXT NOT NULL,
    agency       TEXT,                              -- who performed it (CERT-In empanelled firm, STQC lab, panel org)
    assessed_on  DATE,
    outcome      TEXT NOT NULL DEFAULT 'in_progress',   -- passed | failed | partial | in_progress
    summary      TEXT,
    report_ref   TEXT,                              -- file no. / URL / certificate id of the external report
    created_by   UUID REFERENCES users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_extassess_org_time ON external_assessments(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_extassess_domain   ON external_assessments(domain_id);

-- ---------- invitations (join an EXISTING organisation) ----------
-- Without this, every first sign-in produced its own single-person organisation
-- (users.org_id starts NULL and domains.register auto-provisioned one), so two
-- colleagues from the same ministry could never share domains or audits.
-- An invite is consumed by verify_otp when the invited address first signs in.
CREATE TABLE IF NOT EXISTS invitations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       UUID NOT NULL REFERENCES organisations(id),
    email        CITEXT NOT NULL,
    role         user_role NOT NULL DEFAULT 'contributor',
    invited_by   UUID REFERENCES users(id),
    status       TEXT NOT NULL DEFAULT 'pending',   -- pending | accepted | revoked
    expires_at   TIMESTAMPTZ NOT NULL,
    accepted_at  TIMESTAMPTZ,
    accepted_by  UUID REFERENCES users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- same gov-only invariant as users.chk_gov_email: you cannot invite a
    -- non-government address into an organisation
    CONSTRAINT chk_gov_invite_email CHECK (email ~* '[@.](gov|nic)\.in$')
);
-- at most ONE live invite per address: a second invite must revoke/replace the
-- first, otherwise which org the invitee lands in depends on row order
CREATE UNIQUE INDEX IF NOT EXISTS uq_invite_pending_email
    ON invitations(email) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_invite_org_time ON invitations(org_id, created_at DESC);
