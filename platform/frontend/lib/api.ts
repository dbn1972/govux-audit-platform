// Minimal API client. Access token kept in memory; refresh cookie is HttpOnly.
let accessToken: string | null = null;

export function setToken(t: string | null) { accessToken = t; }

/** Thrown when the session can't be recovered — callers/boundaries treat as sign-out. */
export class AuthError extends Error {}

async function req(path: string, opts: RequestInit = {}, retry = true): Promise<any> {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(opts.headers || {}),
    },
    credentials: "include", // send/receive the HttpOnly refresh cookie
  });
  if (res.status === 401 && retry) {
    // silent refresh (device-bound rotating token), then retry once — this is
    // what makes a page reload (in-memory token gone) resume the session, same
    // as an access token expiring mid-session. Explicit sign-out (Sign out
    // button, or the idle timeout in AppShell) is what actually ends a session.
    const r = await fetch(`/api/v1/auth/refresh`, { method: "POST", credentials: "include" });
    if (r.ok) { const d = await r.json(); setToken(d.access_token); return req(path, opts, false); }
  }
  if (res.status === 401) {
    // unrecoverable: bounce to sign-in (except for the auth calls on /login itself)
    if (typeof window !== "undefined" && !path.startsWith("/v1/auth/")) {
      setToken(null);
      window.location.assign("/login");
    }
    throw new AuthError("Your session has expired — please sign in again.");
  }
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))).detail;
    // detail is usually a string, but some endpoints (e.g. OTP lockout) send a
    // structured object — {message, retry_after, captcha_required} — instead.
    const msg = typeof detail === "string" ? detail
      : detail && typeof detail === "object" && typeof detail.message === "string" ? detail.message
      : res.statusText;
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  requestOtp: (email: string) =>
    req("/v1/auth/otp/request", { method: "POST", body: JSON.stringify({ email }) }),
  verifyOtp: (email: string, code: string, device_pubkey: string, trust_device = true) =>
    req("/v1/auth/otp/verify", { method: "POST",
      body: JSON.stringify({ email, code, device_pubkey, trust_device }) }),
  me: () => req("/v1/auth/me"),
  logout: () => req("/v1/auth/logout", { method: "POST" }),
  updateOrganisation: (body: { name?: string; state_code?: string }) =>
    req("/v1/auth/organisation", { method: "PATCH", body: JSON.stringify(body) }),
  listTeam: () => req("/v1/auth/team"),
  updateTeamRole: (userId: string, role: string) =>
    req(`/v1/auth/team/${userId}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
  listInvitations: () => req("/v1/auth/invitations"),
  createInvitation: (email: string, role: string) =>
    req("/v1/auth/invitations", { method: "POST", body: JSON.stringify({ email, role }) }),
  revokeInvitation: (id: string) => req(`/v1/auth/invitations/${id}`, { method: "DELETE" }),
  exportMyData: () => req("/v1/auth/me/export"),
  eraseMyData: () => req("/v1/auth/me", { method: "DELETE" }),
  devices: () => req("/v1/auth/devices"),
  scanRequests: () => req("/v1/scan-requests"),
  createScanRequest: (domain_id: string, requested_pages: number, reason?: string) =>
    req("/v1/scan-requests", { method: "POST", body: JSON.stringify({ domain_id, requested_pages, reason }) }),
  decideScanRequest: (id: string, status: "approved" | "rejected") =>
    req(`/v1/scan-requests/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  revokeDevice: (id: string) => req(`/v1/auth/devices/${id}`, { method: "DELETE" }),
  listDomains: () => req("/v1/domains"),
  submitAudit: (domain_id: string, depth: number = 10) =>
    req("/v1/audits", { method: "POST", body: JSON.stringify({ domain_id, depth }) }),
  cancelAudit: (taskId: string) =>
    req(`/v1/audits/${taskId}/cancel`, { method: "POST" }),
  listAudits: () => req("/v1/audits"),
  auditStatus: (taskId: string) => req(`/v1/audits/${taskId}`),
  auditReport: (taskId: string) => req(`/v1/audits/${taskId}/report`),
  reviewAudit: (taskId: string, approved: boolean, notes?: string) =>
    req(`/v1/audits/${taskId}/review`, { method: "POST",
      body: JSON.stringify({ approved, notes }) }),
  // guided manual review: the guidelines automation can't decide, plus any
  // decisions already recorded against this audit
  reviewChecklist: (taskId: string,
                    p: { enforcement?: string; category?: string; standard?: string;
                         platform?: string } = {}) => {
    const qs = new URLSearchParams();
    if (p.enforcement) qs.set("enforcement", p.enforcement);
    if (p.category) qs.set("category", p.category);
    if (p.standard) qs.set("standard", p.standard);
    if (p.platform) qs.set("platform", p.platform);
    const s = qs.toString();
    return req(`/v1/audits/${taskId}/review-checklist${s ? `?${s}` : ""}`);
  },
  setReviewItem: (taskId: string, guidelineId: string, decision: string, note?: string) =>
    req(`/v1/audits/${taskId}/review-checklist/${encodeURIComponent(guidelineId)}`,
        { method: "PUT", body: JSON.stringify({ decision, note }) }),
  registerDomain: (url: string, category?: string) =>
    req("/v1/domains", { method: "POST", body: JSON.stringify({ url, service_category: category }) }),
  // proof method is the caller's choice: many gov teams run the web server but
  // not the DNS zone (often held centrally by NIC), so the metafile route is the
  // only one they can actually complete
  verifyDomain: (id: string, method: "dns_txt" | "file_upload" = "dns_txt") =>
    req(`/v1/domains/${id}/verify`, { method: "POST", body: JSON.stringify({ method }) }),
  // steward override — verified WITHOUT ownership proof, so the reason is
  // mandatory and the actor is recorded server-side
  forceVerifyDomain: (id: string, reason: string) =>
    req(`/v1/domains/${id}/force-verify`, { method: "POST", body: JSON.stringify({ reason }) }),
  domainClaims: (contestedOnly = false) =>
    req(`/v1/domains/claims${contestedOnly ? "?contested_only=true" : ""}`),
  releaseClaim: (id: string) => req(`/v1/domains/claims/${id}`, { method: "DELETE" }),
  guidelines: (family?: string) => req(`/v1/guidelines${family ? `?family=${family}` : ""}`),
  updateFinding: (id: string, state: string) =>
    req(`/v1/findings/${id}`, { method: "PATCH", body: JSON.stringify({ state, is_reviewed: true }) }),
  auditHistory: (domainId: string) => req(`/v1/domains/${domainId}/audits`),
  // defaults to comparing against the domain's most recent prior completed
  // audit; pass `against` (another audit's task_id) to pick a specific one
  compare: (taskId: string, against?: string) =>
    req(`/v1/audits/${taskId}/compare${against ? `?against=${against}` : ""}`),
  national: () => req("/v1/national"),
  rankings: (category?: string) => req(`/v1/rankings${category ? `?category=${category}` : ""}`),
  ministries: () => req("/v1/ministries"),
  states: () => req("/v1/states"),
  alerts: () => req("/v1/alerts"),
  organisations: (p: { q?: string; org_type?: string; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams();
    if (p.q) qs.set("q", p.q);
    if (p.org_type) qs.set("org_type", p.org_type);
    if (p.limit != null) qs.set("limit", String(p.limit));
    if (p.offset != null) qs.set("offset", String(p.offset));
    const s = qs.toString();
    return req(`/v1/organisations${s ? `?${s}` : ""}`);
  },
  importRegistry: (csv: string, dry_run: boolean) =>
    req("/v1/admin/registry/import", { method: "POST", body: JSON.stringify({ csv, dry_run }) }),
  createOrganisation: (body: { name: string; org_type: string; state_code?: string }) =>
    req("/v1/organisations", { method: "POST", body: JSON.stringify(body) }),
  patchOrganisation: (id: string, body: { name?: string; org_type?: string; state_code?: string }) =>
    req(`/v1/organisations/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  auditTrend: (taskId: string) => req(`/v1/audits/${taskId}/trend`),
  bulkScan: (scope: string) =>
    req("/v1/bulk-scans", { method: "POST", body: JSON.stringify({ mode: "auto_discover", scope }) }),
  bulkScanStatus: (batchId: string) => req(`/v1/bulk-scans/${batchId}`),
  // gap-closure endpoints
  remediation: (taskId: string, enrich = false) =>
    req(`/v1/audits/${taskId}/remediation${enrich ? "?enrich=1" : ""}`),
  auditDocuments: (taskId: string) => req(`/v1/audits/${taskId}/documents`),
  schedules: () => req("/v1/schedules"),
  createSchedule: (domain_id: string, cadence: string) =>
    req("/v1/schedules", { method: "POST", body: JSON.stringify({ domain_id, cadence }) }),
  deleteSchedule: (id: string) => req(`/v1/schedules/${id}`, { method: "DELETE" }),
  discovered: () => req("/v1/discovery"),
  discoveryScan: (samples: any[]) =>
    req("/v1/discovery/scan", { method: "POST", body: JSON.stringify({ samples }) }),
  ciGate: (domainId: string, minScore = 70) =>
    req(`/v1/ci/gate?domain_id=${domainId}&min_score=${minScore}`),
  adminConfig: () => req("/v1/admin/config"),
  updateConfig: (updates: Record<string, any>) =>
    req("/v1/admin/config", { method: "PATCH", body: JSON.stringify({ updates }) }),
  testEmail: (to: string) =>
    req("/v1/admin/config/test-email", { method: "POST", body: JSON.stringify({ to }) }),
  adminMetrics: () => req("/v1/admin/config/metrics-summary"),
  // GovUX Studio
  studioCreate: (body: any) => req("/v1/studio", { method: "POST", body: JSON.stringify(body) }),
  listStudio: () => req("/v1/studio"),
  studioGet: (id: string) => req(`/v1/studio/${id}`),
  studioPreview: async (id: string, file: string): Promise<string> => {
    const r = await fetch(`/api/v1/studio/${id}/preview/${file}`,
      { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}, credentials: "include" });
    return r.ok ? r.text() : "";
  },
  studioDownload: async (id: string): Promise<Blob> => {
    const r = await fetch(`/api/v1/studio/${id}/download`,
      { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}, credentials: "include" });
    return r.blob();
  },
  studioPublish: (id: string, publish: boolean, title?: string) =>
    req(`/v1/studio/${id}/publish`, { method: "POST", body: JSON.stringify({ publish, title }) }),
  // manual-assurance ledger (G9/G11/G13) + STQC evidence pack (G12)
  listAssessments: (kind?: string) => req(`/v1/assessments${kind ? `?kind=${kind}` : ""}`),
  createAssessment: (body: any) =>
    req("/v1/assessments", { method: "POST", body: JSON.stringify(body) }),
  evidencePack: async (taskId: string): Promise<Blob> => {
    const r = await fetch(`/api/v1/audits/${taskId}/evidence`,
      { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}, credentials: "include" });
    if (!r.ok) throw new Error("Evidence pack not ready");
    return r.blob();
  },
  studioTenants: () => req("/v1/studio/tenants"),
  studioSetTenant: (orgId: string, enabled: boolean) =>
    req(`/v1/studio/tenants/${orgId}`, { method: "PATCH", body: JSON.stringify({ enabled }) }),
};
