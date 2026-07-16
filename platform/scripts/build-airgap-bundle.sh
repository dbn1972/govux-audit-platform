#!/usr/bin/env bash
# GovUX air-gapped bundle builder (Volume-11 §10).
# Run on a CONNECTED machine. Produces a self-contained tarball that installs the
# whole stack inside a restricted/air-gapped enclave with NO online dependency.
#
#   ./scripts/build-airgap-bundle.sh                 # full bundle (builds + saves images)
#   TAG=1.1 ./scripts/build-airgap-bundle.sh
#   ./scripts/build-airgap-bundle.sh --skip-images   # scaffolding only (CI/test)
#
# Bundle contents: images.tar, docker-compose.airgap.yml, .env.example, scripts/,
# load-and-run.sh, MANIFEST.txt, SHA256SUMS.
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"        # platform/

TAG="${TAG:-1.1}"
SKIP_IMAGES=0
OUT="govux-airgap-${TAG}"
for a in "$@"; do case "$a" in --skip-images) SKIP_IMAGES=1;; --out=*) OUT="${a#*=}";; esac; done

BASE_IMAGES=(pgvector/pgvector:pg16 redis:7 minio/minio:latest)
APP_IMAGES=(govux/backend:"$TAG" govux/frontend:"$TAG")
GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo n/a)"

echo "── Building air-gapped bundle ${OUT} (tag ${TAG}) ─────────────────────"
rm -rf "$OUT"; mkdir -p "$OUT/scripts"

# 1. images ------------------------------------------------------------------
if [ "$SKIP_IMAGES" -eq 0 ]; then
  echo "Building app images…";  docker build -t "govux/backend:${TAG}" backend
  docker build -t "govux/frontend:${TAG}" frontend
  echo "Pulling base images…";  for i in "${BASE_IMAGES[@]}"; do docker pull "$i"; done
  echo "Saving images → images.tar (this is the large part)…"
  docker save -o "$OUT/images.tar" "${APP_IMAGES[@]}" "${BASE_IMAGES[@]}"
else
  echo "· --skip-images: scaffolding only (no images.tar)"
fi

# 2. config + scripts --------------------------------------------------------
cp .env.example "$OUT/.env.example"
cp scripts/preinstall-check.sh scripts/diagnostic-bundle.sh "$OUT/scripts/"

# 3. air-gapped compose (pre-built images, pull_policy: never) ---------------
cat > "$OUT/docker-compose.airgap.yml" <<YAML
# Single-node air-gapped deployment — uses ONLY pre-loaded images (no pull).
services:
  db:
    image: pgvector/pgvector:pg16
    pull_policy: never
    environment:
      POSTGRES_USER: \${POSTGRES_USER}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
      POSTGRES_DB: \${POSTGRES_DB}
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: always
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "\${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 10
  redis:
    image: redis:7
    pull_policy: never
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redisdata:/data
    restart: always
  minio:
    image: minio/minio:latest
    pull_policy: never
    command: ["server", "/data", "--console-address", ":9001"]
    environment:
      MINIO_ROOT_USER: \${POSTGRES_USER}
      MINIO_ROOT_PASSWORD: \${POSTGRES_PASSWORD}
    volumes:
      - miniodata:/data
    restart: always
  api:
    image: govux/backend:${TAG}
    pull_policy: never
    entrypoint: ["/app/entrypoint.sh"]
    command: ["gunicorn", "app.main:app", "-k", "uvicorn.workers.UvicornWorker", "--workers", "4", "--bind", "0.0.0.0:8000", "--timeout", "60", "--access-logfile", "-"]
    environment:
      GOVUX_ENV: production
      GOVUX_DATABASE_URL: postgresql+psycopg://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@db:5432/\${POSTGRES_DB}
      GOVUX_REDIS_URL: redis://redis:6379/0
      GOVUX_CACHE_REDIS_URL: redis://redis:6379/1
      GOVUX_JWT_SECRET: \${GOVUX_JWT_SECRET}
      GOVUX_SECRET_KEY: \${GOVUX_SECRET_KEY}
      GOVUX_CORS_ORIGINS: \${GOVUX_CORS_ORIGINS}
      GOVUX_CRUX_API_KEY: ""
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    ports:
      - "8000:8000"
    restart: always
  worker:
    image: govux/backend:${TAG}
    pull_policy: never
    command: ["python", "-m", "app.worker"]
    environment:
      GOVUX_ENV: production
      GOVUX_DATABASE_URL: postgresql+psycopg://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@db:5432/\${POSTGRES_DB}
      GOVUX_REDIS_URL: redis://redis:6379/0
      GOVUX_CACHE_REDIS_URL: redis://redis:6379/1
      GOVUX_JWT_SECRET: \${GOVUX_JWT_SECRET}
      GOVUX_SECRET_KEY: \${GOVUX_SECRET_KEY}
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    restart: always
  web:
    image: govux/frontend:${TAG}
    pull_policy: never
    command: ["npm", "run", "start"]
    environment:
      GOVUX_API_URL: http://api:8000
      NODE_ENV: production
    depends_on:
      - api
    ports:
      - "3000:3000"
    restart: always
volumes:
  pgdata: {}
  redisdata: {}
  miniodata: {}
YAML

# 4. enclave installer -------------------------------------------------------
cat > "$OUT/load-and-run.sh" <<'INSTALL'
#!/usr/bin/env bash
# GovUX air-gapped installer — run INSIDE the enclave. Makes NO network calls.
set -euo pipefail
cd "$(dirname "$0")"
sha() { command -v sha256sum >/dev/null 2>&1 && sha256sum "$@" || shasum -a 256 "$@"; }

echo "1/5 Verifying artifact integrity…"
sha -c SHA256SUMS

echo "2/5 Loading container images…"
if [ -f images.tar ]; then docker load -i images.tar; else echo "  (no images.tar — scaffolding bundle)"; fi

echo "3/5 Checking configuration…"
if [ ! -f .env ]; then
  echo "  ✗ .env not found. Copy .env.example to .env and set real secrets, then re-run."
  exit 1
fi
bash scripts/preinstall-check.sh --prod --env-file .env

echo "4/5 Starting the stack (offline; images already loaded)…"
docker compose -f docker-compose.airgap.yml --env-file .env up -d

echo "5/5 Waiting for health…"
for i in $(seq 1 30); do
  if curl -fs http://localhost:8000/healthz >/dev/null 2>&1; then echo "  ✓ healthy"; exit 0; fi
  sleep 5
done
echo "  ! not healthy yet — check: docker compose -f docker-compose.airgap.yml logs"
exit 1
INSTALL
chmod +x "$OUT/load-and-run.sh"

# 5. manifest (dependency closure) -------------------------------------------
{
  echo "GovUX air-gapped bundle"
  echo "tag: ${TAG}"
  echo "git_sha: ${GIT_SHA}"
  echo "images:"
  for i in "${APP_IMAGES[@]}" "${BASE_IMAGES[@]}"; do echo "  - $i"; done
  echo "air-gapped rule: after this bundle is built, the enclave installer makes NO"
  echo "online calls; CrUX field data is disabled and pull_policy is 'never'."
} > "$OUT/MANIFEST.txt"

# 6. checksums (over everything except the checksum file itself) --------------
( cd "$OUT" && find . -type f ! -name SHA256SUMS -print0 \
    | xargs -0 "$(command -v sha256sum >/dev/null 2>&1 && echo sha256sum || echo 'shasum -a 256')" \
    > SHA256SUMS )

# 7. package -----------------------------------------------------------------
tar -czf "${OUT}.tar.gz" "$OUT"
echo "── Done ────────────────────────────────────────────────────────────"
echo "  Bundle:    ${OUT}.tar.gz"
echo "  Artifacts: $(find "$OUT" -type f | wc -l | tr -d ' ') files"
echo "  Transfer ${OUT}.tar.gz into the enclave, extract, create .env, then:"
echo "    ./load-and-run.sh"
