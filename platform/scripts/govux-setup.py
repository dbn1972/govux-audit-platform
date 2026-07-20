#!/usr/bin/env python3
"""GovUX guided setup + architecture-recommendation engine (Volume-11 §4–5).

Asks business-first questions, recommends a topology (Small / Medium / Enterprise /
HA, plus restricted-network / air-gapped), and generates the deployment inputs:
a secure .env (secrets auto-generated), Helm values (for K8s tiers), and an
operator handoff summary.

  python3 scripts/govux-setup.py                       # interactive wizard
  python3 scripts/govux-setup.py --answers ans.json    # non-interactive (CI/DevOps)
  python3 scripts/govux-setup.py --answers ans.json --dry-run
  python3 scripts/govux-setup.py --out ./deploy-out

Stdlib only. Secrets are written to files at 0600 and never echoed to the console.
"""
from __future__ import annotations
import argparse
import json
import os
import secrets
import sys
import textwrap

# ── questions (business-friendly first, §4.1 / §5.2) ─────────────────────────
QUESTIONS = [
    {"key": "purpose", "type": "choice", "choices": ["trial", "internal", "production"],
     "default": "production", "prompt": "What is this deployment for?"},
    {"key": "total_users", "type": "int", "default": 500,
     "prompt": "Roughly how many total users?"},
    {"key": "concurrent_users", "type": "int", "default": 50,
     "prompt": "Peak concurrent users?"},
    {"key": "monthly_growth_gb", "type": "int", "default": 5,
     "prompt": "Expected data growth per month (GB)?"},
    {"key": "ha_required", "type": "bool", "default": False,
     "prompt": "Is high availability required?"},
    {"key": "downtime_acceptable", "type": "bool", "default": True,
     "prompt": "Is brief planned downtime acceptable?"},
    {"key": "target", "type": "choice", "choices": ["onprem", "private_cloud", "public_cloud"],
     "default": "private_cloud", "prompt": "Where will it run?"},
    {"key": "network", "type": "choice", "choices": ["standard", "restricted", "airgapped"],
     "default": "standard", "prompt": "Network posture?"},
    {"key": "compliance", "type": "choice", "choices": ["standard", "dpdp", "certin"],
     "default": "dpdp", "prompt": "Compliance posture?"},
    {"key": "sso_required", "type": "bool", "default": False,
     "prompt": "Is SSO/MFA mandated by the authority?"},
    {"key": "cors_origin", "type": "str", "default": "https://govux.gov.in",
     "prompt": "Public frontend origin (for CORS)?"},
]


# ── interactive prompting (validate, retry, clear errors) ────────────────────
def ask(q):
    d = q["default"]
    while True:
        hint = f" [{'/'.join(q['choices'])}]" if q["type"] == "choice" else \
               " [y/n]" if q["type"] == "bool" else ""
        raw = input(f"  {q['prompt']}{hint} ({d}): ").strip()
        if raw == "":
            return d
        try:
            if q["type"] == "int":
                v = int(raw)
                if v < 0:
                    raise ValueError
                return v
            if q["type"] == "bool":
                if raw.lower() in ("y", "yes", "true", "1"):
                    return True
                if raw.lower() in ("n", "no", "false", "0"):
                    return False
                raise ValueError
            if q["type"] == "choice":
                if raw in q["choices"]:
                    return raw
                raise ValueError
            return raw
        except ValueError:
            print(f"    ✗ Invalid value. Expected {q['type']}"
                  + (f" one of {q['choices']}" if q["type"] == "choice" else "") + ".")


def gather_interactive():
    print("── GovUX guided setup ──────────────────────────────────────────────")
    print("Answer a few business questions; press Enter to accept the default.\n")
    return {q["key"]: ask(q) for q in QUESTIONS}


def apply_defaults(answers):
    out = {q["key"]: q["default"] for q in QUESTIONS}
    out.update(answers or {})
    return out


# ── recommendation engine (§4.2 / §4.3) ──────────────────────────────────────
TIERS = {
    "small":      {"api": 1, "worker": 1, "web": 1, "data": "bundled (single instance)",
                   "deploy": "Docker Compose", "artifact": "docker-compose.yml (+ Ansible)",
                   "monitoring": "basic", "backup": "manual", "ha": False},
    "medium":     {"api": 2, "worker": 3, "web": 2, "data": "external Postgres + Redis",
                   "deploy": "Docker Compose (prod)", "artifact": "docker-compose.prod.yml (+ Ansible)",
                   "monitoring": "baseline + alerts", "backup": "scheduled", "ha": False},
    "enterprise": {"api": 3, "worker": 6, "web": 2, "data": "external managed Postgres + split Redis + S3",
                   "deploy": "Kubernetes (Helm)", "artifact": "Helm chart (+ Terraform)",
                   "monitoring": "metrics + alerts + tracing", "backup": "scheduled + DR", "ha": False},
    "ha":         {"api": 4, "worker": 10, "web": 3, "data": "HA Postgres cluster + HA Redis + S3",
                   "deploy": "Kubernetes (Helm, multi-AZ)", "artifact": "Helm chart (+ Terraform)",
                   "monitoring": "metrics + alerts + tracing", "backup": "continuous + tested DR", "ha": True},
}


def recommend(a):
    tier = "small"
    if a["purpose"] == "production":
        tier = "medium"
    if a["total_users"] > 2000 or a["concurrent_users"] > 100:
        tier = "medium"
    if a["total_users"] > 50000 or a["concurrent_users"] > 1000 or a["monthly_growth_gb"] > 200:
        tier = "enterprise"
    if a["ha_required"] or not a["downtime_acceptable"]:
        tier = "ha"
    if a["purpose"] == "trial":
        tier = "small"          # a trial is always Small regardless

    rec = dict(TIERS[tier], tier=tier)
    rec["k8s"] = tier in ("enterprise", "ha")
    rec["airgapped"] = a["network"] == "airgapped"
    rec["restricted"] = a["network"] in ("restricted", "airgapped")
    rec["crux"] = not rec["restricted"]          # no external CrUX call in restricted nets
    rec["autoscaling"] = tier in ("enterprise", "ha")
    rec["notes"] = []
    if a["sso_required"]:
        rec["notes"].append("SSO/MFA is mandated — integrate OIDC before go-live (not shipped; device-binding ≠ MFA).")
    if rec["restricted"]:
        rec["notes"].append("Restricted network — use an internal image registry; CrUX field data disabled.")
    if rec["airgapped"]:
        rec["notes"].append("Air-gapped — mirror images + dependencies into the enclave; no online calls at runtime.")
    if a["compliance"] in ("dpdp", "certin"):
        rec["notes"].append(f"{a['compliance'].upper()} posture — enable audit retention, run a restore drill, seek accreditation.")
    if not rec["ha"] and a["purpose"] == "production":
        rec["notes"].append("Not HA — single data-tier is a downtime risk; enable HA if uptime is critical.")
    return rec


# ── generation (§4.4 / §5.3 / §14 secure defaults) ───────────────────────────
def gen_secret():
    return secrets.token_urlsafe(48)


def render_env(a):
    jwt, key = gen_secret(), gen_secret()
    while key == jwt:
        key = gen_secret()
    return textwrap.dedent(f"""\
        # Generated by govux-setup — secrets are unique to this deployment. Keep private.
        POSTGRES_USER=govux
        POSTGRES_PASSWORD={gen_secret()}
        POSTGRES_DB=govux

        GOVUX_ENV=production
        GOVUX_JWT_SECRET={jwt}
        GOVUX_SECRET_KEY={key}
        GOVUX_CORS_ORIGINS={a['cors_origin']}
        GOVUX_CRUX_API_KEY={'' if a['network'] != 'standard' else ''}
        """)


def render_helm_values(a, rec):
    return textwrap.dedent(f"""\
        # Generated by govux-setup for the '{rec['tier']}' tier.
        # helm install govux platform/deploy/helm/govux -f this-file.yaml --set secrets...
        env: production
        image:
          registry: "{'REGISTRY/' if not rec['restricted'] else 'internal-registry.local/'}"
          tag: "1.1"
        config:
          corsOrigins: "{a['cors_origin']}"
          redisUrl: "redis://govux-redis:6379/0"
          cacheRedisUrl: "redis://govux-redis-cache:6379/0"
        api:
          replicas: {rec['api']}
          autoscaling: {{ enabled: {str(rec['autoscaling']).lower()}, minReplicas: {rec['api']}, maxReplicas: {rec['api'] * 3} }}
        worker:
          replicas: {rec['worker']}
          autoscaling: {{ enabled: {str(rec['autoscaling']).lower()}, minReplicas: {rec['worker']}, maxReplicas: {rec['worker'] * 3} }}
        web:
          replicas: {rec['web']}
        ingress:
          enabled: true
          host: {a['cors_origin'].replace('https://', '').replace('http://', '')}
        """)


def render_summary(a, rec):
    lines = [
        "# GovUX — Setup & Architecture Summary", "",
        f"**Recommended tier:** {rec['tier'].upper()}  ·  **Deploy via:** {rec['deploy']}", "",
        "## Your answers",
    ]
    for q in QUESTIONS:
        lines.append(f"- {q['prompt']}  **{a[q['key']]}**")
    lines += [
        "", "## Recommended architecture",
        f"- App (API) nodes: **{rec['api']}**",
        f"- Audit worker nodes: **{rec['worker']}** (3 browser engines each — heavy)",
        f"- Web nodes: **{rec['web']}**",
        f"- Data stores: **{rec['data']}**",
        f"- Autoscaling: **{'enabled' if rec['autoscaling'] else 'off'}**  ·  HA: **{'yes' if rec['ha'] else 'no'}**",
        f"- Monitoring: **{rec['monitoring']}**  ·  Backup: **{rec['backup']}**",
        f"- CrUX field data: **{'enabled' if rec['crux'] else 'disabled (restricted net)'}**",
        "", "## Deployment artifact",
        f"- Use: **{rec['artifact']}**",
        "- Generated: `.env`" + (", `helm-values.yaml`" if rec['k8s'] else ""),
        "", "## Operator notes",
    ]
    lines += [f"- {n}" for n in rec["notes"]] or ["- (none)"]
    lines += [
        "", "## Minimum before go-live",
        "1. Put TLS termination in front (HSTS/CSP) — the app assumes HTTPS.",
        "2. Boot the stack once end-to-end and confirm `/healthz` + migrate-on-boot.",
        "3. Take a backup and run a **verified restore drill** (set RPO/RTO).",
        "4. Set a `metrics_token` (Admin → Configuration → Monitoring).",
        "5. Apply the worker egress policy (deny RFC1918 / 169.254.0.0/16).",
        "", "_Next: `./scripts/preinstall-check.sh --prod`, then deploy per the artifact above "
        "(see docs/DEPLOYMENT.md)._",
    ]
    return "\n".join(lines) + "\n"


def write_file(path, content, mode=0o644):
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    os.chmod(path, mode)


# ── main ─────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description="GovUX guided setup + architecture recommendation")
    ap.add_argument("--answers", help="JSON file of answers (non-interactive)")
    ap.add_argument("--out", default="deploy-out", help="output directory (default: deploy-out)")
    ap.add_argument("--dry-run", action="store_true", help="print the plan; write nothing")
    args = ap.parse_args()

    if args.answers:
        try:
            with open(args.answers, encoding="utf-8") as f:
                answers = apply_defaults(json.load(f))
        except Exception as e:
            print(f"✗ Could not read answers file: {e}", file=sys.stderr)
            return 2
    elif sys.stdin.isatty():
        answers = gather_interactive()
    else:
        print("✗ No --answers file and no interactive terminal.", file=sys.stderr)
        return 2

    rec = recommend(answers)

    print("\n── Recommendation ──────────────────────────────────────────────────")
    print(f"  Tier: {rec['tier'].upper()}  ·  Deploy: {rec['deploy']}")
    print(f"  api={rec['api']} worker={rec['worker']} web={rec['web']}  data: {rec['data']}")
    print(f"  autoscaling={rec['autoscaling']} ha={rec['ha']} crux={rec['crux']}")
    for n in rec["notes"]:
        print(f"  • {n}")

    if args.dry_run:
        print("\n(dry-run — no files written)")
        return 0

    os.makedirs(args.out, exist_ok=True)
    write_file(os.path.join(args.out, ".env"), render_env(answers), mode=0o600)
    write_file(os.path.join(args.out, "SETUP_SUMMARY.md"), render_summary(answers, rec))
    written = [".env (0600)", "SETUP_SUMMARY.md"]
    if rec["k8s"]:
        write_file(os.path.join(args.out, "helm-values.yaml"), render_helm_values(answers, rec))
        written.append("helm-values.yaml")

    print(f"\n✓ Wrote to {args.out}/: {', '.join(written)}")
    print("  Secrets were generated and written to .env (mode 0600) — never printed.")
    print(f"  Next: cd platform && ./scripts/preinstall-check.sh --prod --env-file {args.out}/.env")
    return 0


if __name__ == "__main__":
    sys.exit(main())
