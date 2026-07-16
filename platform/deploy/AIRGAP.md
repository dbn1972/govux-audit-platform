# GovUX — Offline / Air-Gapped Installation (Volume-11 §10)

Install the full stack inside a restricted or air-gapped enclave with **no online
dependency**. The bundle carries every container image, the config, the scripts, and
a self-verifying installer.

## 1. Build the bundle (on a CONNECTED machine)

```bash
cd platform
TAG=1.1 ./scripts/build-airgap-bundle.sh
# → govux-airgap-1.1.tar.gz
```

This builds the app images, pulls the base images (`pgvector`, `redis`, `minio`),
`docker save`s them all into `images.tar`, generates a single-node
`docker-compose.airgap.yml` (every service `pull_policy: never`), copies the
pre-install validator + diagnostic tools, writes a `MANIFEST.txt` (dependency
closure) and a `SHA256SUMS`, and tars it up.

> `--skip-images` produces the scaffolding only (used by CI to validate structure).

## 2. Transfer

Move `govux-airgap-1.1.tar.gz` into the enclave by your approved media/transfer
process. Verify the tarball's checksum out-of-band if your policy requires it.

## 3. Install (INSIDE the enclave — offline)

```bash
tar -xzf govux-airgap-1.1.tar.gz && cd govux-airgap-1.1
cp .env.example .env        # set real secrets (or drop in the wizard's .env)
./load-and-run.sh
```

`load-and-run.sh` makes **no network calls**. It:

1. verifies every artifact against `SHA256SUMS` (integrity),
2. `docker load`s the images from `images.tar`,
3. runs the pre-install validator (`--prod`),
4. brings up `docker-compose.airgap.yml` (images already present; nothing is pulled),
5. waits for `/healthz`.

## Air-gapped guarantees

- **Dependency closure** is documented in `MANIFEST.txt` and enforced by
  `pull_policy: never` on every service.
- **CrUX field data is disabled** (no external calls) — performance stays lab-only.
- **Integrity**: `SHA256SUMS` covers every file; the installer refuses to proceed on
  a mismatch. Sign the tarball/manifest with your PKI for stronger assurance.

## Upgrades & patching

Build a new bundle from the upgraded source on the connected side, transfer it, and
re-run `load-and-run.sh` — migrations run on boot (additive), and images are replaced
by `docker load`. Keep the previous bundle for rollback.

## Limitations in restricted networks

- No external CrUX field data; no cloud marketplace / online plugin fetch.
- Object storage is the bundled MinIO (swap for an in-enclave S3 if available).
- For multi-node HA in an enclave, use the Helm chart against an in-enclave cluster
  with a mirrored image registry.
