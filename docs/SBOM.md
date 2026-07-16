# Software Bill of Materials (SBOM)

An SBOM is a complete, machine-readable inventory of every component in the
product — direct **and** transitive — used for supply-chain security,
vulnerability scanning, and procurement. This project produces SBOMs in the
[CycloneDX](https://cyclonedx.org/) format from its pinned manifests and
lockfiles, so the output is reproducible rather than hand-maintained.

## Generate

```bash
scripts/generate-sbom.sh            # writes sbom/ (CycloneDX JSON, one per component + a merged file)
```

The script inventories:

- **Backend Python** deps from `platform/backend/requirements.txt` (+ dev) via `cyclonedx-py`
- **Audit engine** and **frontend** Node deps from their `package-lock.json` via `@cyclonedx/cyclonedx-npm`
- **Container images** (base OS + system packages) via `syft`, if installed

Outputs land in `sbom/` as CycloneDX 1.5 JSON:

```
sbom/backend.cdx.json
sbom/engine.cdx.json
sbom/frontend.cdx.json
sbom/images.cdx.json        # if syft present
sbom/govux.merged.cdx.json  # everything, merged
```

## Scan the SBOM for vulnerabilities

Any CycloneDX-aware scanner works, e.g.:

```bash
grype sbom:sbom/govux.merged.cdx.json      # Anchore Grype
trivy sbom sbom/govux.merged.cdx.json      # Aqua Trivy
osv-scanner --sbom sbom/govux.merged.cdx.json   # Google OSV-Scanner
```

## When to regenerate

- On every dependency bump (add it to your release checklist — see
  [VERSIONING.md](VERSIONING.md)).
- Before each tagged release; attach the merged SBOM to the release artifacts.
- On demand for a procurement or security review.

> A human-readable summary of **direct** dependencies and their licenses is in
> [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md). The SBOM here is the
> authoritative, transitive, machine-readable source of truth.
