# syntax=docker/dockerfile:1
# bookworm pin: playwright 1.44 --with-deps knows Debian 12's package names
FROM python:3.12-slim-bookworm AS base
WORKDIR /app

# Node.js for the audit engine (Playwright + Lighthouse + axe-core)
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm \
    && rm -rf /var/lib/apt/lists/*

# audit engine deps + the full browser matrix (Chromium/Chrome+Edge, Firefox,
# WebKit=Safari/iOS) so every audit can run cross-browser. --with-deps pulls the
# browsers' system libraries. Done BEFORE pip so that changing requirements.txt
# does not re-run this expensive step (keeps cross-browser a permanent capability
# without a browser re-download on every Python dep change).
COPY audit_engine/package.json audit_engine/
# disable apt's date/valid-until checks — the build VM clock can be skewed, which
# otherwise fails GPG signature validation with "invalid signature". Then install
# the browsers AND their system libraries with --with-deps. No masking retry:
# if apt fails, the build must fail loudly rather than ship browsers with no libs.
# The browsers must land in an image LAYER, not a build cache. A BuildKit cache
# mount is discarded when its RUN finishes, and for playwright that mount point
# is the install destination rather than a download cache — so this step used to
# "succeed" while shipping an image with no browsers in it, and the engine died
# at runtime with `Executable doesn't exist at /root/.cache/ms-playwright/...`.
# PLAYWRIGHT_BROWSERS_PATH puts them somewhere a layer keeps, and is read again
# at runtime so node finds them. The npm mount stays: that one really is a cache.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN --mount=type=cache,target=/root/.npm \
    printf 'Acquire::Check-Valid-Until "false";\nAcquire::Check-Date "false";\n' \
        > /etc/apt/apt.conf.d/99no-check-valid \
    && cd audit_engine && npm install --omit=dev \
    && npx playwright install --with-deps chromium firefox webkit

# Python deps last — the layer most likely to change.
# BuildKit cache mount keeps pip's download cache across rebuilds.
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir -r requirements.txt

# ---- dev: adds pytest/pytest-cov so `docker compose exec api pytest` works
# out of the box — docker-compose.yml builds this target explicitly.
FROM base AS dev
COPY requirements-dev.txt .
RUN pip install --no-cache-dir -r requirements-dev.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# ---- final: lean image, no test tooling. The default target (no `target:`
# override), so docker-compose.prod.yml gets this without any change there.
FROM base AS final
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
