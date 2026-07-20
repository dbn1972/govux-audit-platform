#!/usr/bin/env bash
# Generate CycloneDX SBOMs for the GovUX Audit Platform (backend, engine,
# frontend, and — if syft is present — container images). Reproducible from the
# pinned manifests / lockfiles. See docs/SBOM.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/sbom"
mkdir -p "$OUT"
echo "→ writing SBOMs to $OUT"

have() { command -v "$1" >/dev/null 2>&1; }

# --- backend (Python) -------------------------------------------------------
if have cyclonedx-py; then
  cyclonedx-py requirements "$ROOT/platform/backend/requirements.txt" \
    -o "$OUT/backend.cdx.json" --output-format json
  echo "  ✓ backend.cdx.json"
else
  echo "  ⚠ cyclonedx-py not found — pip install cyclonedx-bom  (skipping backend)"
fi

# --- engine + frontend (Node) ----------------------------------------------
gen_npm() {  # $1 = dir, $2 = out name
  if have cyclonedx-npm; then
    ( cd "$1" && cyclonedx-npm --output-format json --output-file "$OUT/$2" ) \
      && echo "  ✓ $2"
  else
    echo "  ⚠ cyclonedx-npm not found — npm i -g @cyclonedx/cyclonedx-npm  (skipping $2)"
  fi
}
gen_npm "$ROOT/platform/backend/audit_engine" "engine.cdx.json"
gen_npm "$ROOT/platform/frontend"             "frontend.cdx.json"

# --- container images (OS + system packages) --------------------------------
if have syft; then
  syft "pgvector/pgvector:pg16" -o cyclonedx-json="$OUT/images.cdx.json" || true
  echo "  ✓ images.cdx.json (base images)"
else
  echo "  ⚠ syft not found — https://github.com/anchore/syft  (skipping image SBOM)"
fi

# --- merge (best-effort) ----------------------------------------------------
if have cyclonedx; then
  # shellcheck disable=SC2046
  cyclonedx merge --output-format json --output-file "$OUT/govux.merged.cdx.json" \
    --input-files $(ls "$OUT"/*.cdx.json 2>/dev/null | grep -v merged) \
    && echo "  ✓ govux.merged.cdx.json"
else
  echo "  ⚠ cyclonedx-cli not found — merged SBOM skipped (component files are still valid)"
fi

echo "→ done. Scan with:  grype sbom:$OUT/govux.merged.cdx.json"
