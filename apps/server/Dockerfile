# syntax=docker/dockerfile:1
#
# Clear A11Y API server. Build from the repository root:
#
#   docker build -f apps/server/Dockerfile -t clear-a11y/server .
#   (or: pnpm nx run server:docker-build)
#
# The base image must match the Playwright version in pnpm-workspace.yaml (catalog `playwright`)
# so the bundled browsers fit the library. Renovate's "playwright" group bumps both together.
#
# Environment (see apps/server/README.md for the full list):
#   HOST=0.0.0.0          set below; a non-loopback HOST requires CLEAR_A11Y_TOKEN
#   PORT=3000
#   CLEAR_A11Y_TOKEN      bearer token (>= 16 chars). Required in this image.
#   DATA_DIR=/data        SQLite database and scan results (mount a volume here)
#   CLEAR_A11Y_DB         SQLite file (default $DATA_DIR/clear-a11y.db)
#   REDIS_URL             use BullMQ on Redis instead of SQLite
#   CLEAR_A11Y_WORKERS    scans at once in this container (default 1; 0 = API only)
#   ALLOWED_TARGETS       comma-separated origins scans may target
#   RATE_LIMIT_PER_MINUTE scan submissions per client IP per minute (default 30)

ARG PLAYWRIGHT_IMAGE=mcr.microsoft.com/playwright:v1.61.1-noble

# ---- build: install the workspace, build the server and its libraries, deploy a pruned copy ----
FROM ${PLAYWRIGHT_IMAGE} AS build
WORKDIR /repo
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    NX_DAEMON=false \
    NX_NO_CLOUD=true \
    CI=true
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm nx run server:build
# Production dependencies only, with workspace packages copied in (their dist/ folders).
RUN pnpm --filter @clear-a11y/server deploy --prod /out

# ---- runtime: browsers come from the Playwright image, the app runs as the non-root pwuser ----
FROM ${PLAYWRIGHT_IMAGE} AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY --from=build --chown=root:root /out /app
RUN mkdir -p /data && chown pwuser:pwuser /data
USER pwuser
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/main.js"]
