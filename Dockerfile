# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d

FROM ${NODE_IMAGE} AS base
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    TMPDIR=/tmp

RUN corepack enable \
  && corepack prepare pnpm@11.20.0 --activate

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY scripts/check-runtime.mjs ./scripts/check-runtime.mjs
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY next.config.mjs tsconfig.json next-env.d.ts payload.config.ts payload-types.ts ./
COPY postcss.config.mjs tailwind.config.ts ./
COPY src ./src
COPY scripts/payload-worker.mjs ./scripts/payload-worker.mjs
RUN mkdir -p public
RUN MMDC_BUILD=1 pnpm run build

FROM base AS production-dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY scripts/check-runtime.mjs ./scripts/check-runtime.mjs
RUN pnpm install --prod --frozen-lockfile

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    TMPDIR=/tmp

LABEL org.opencontainers.image.title="MMDC application" \
      org.opencontainers.image.description="Immutable MMDC web and worker runtime" \
      org.opencontainers.image.base.name="node:24.15.0-bookworm-slim" \
      org.opencontainers.image.base.digest="sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d" \
      com.mmdc.runtime.commands="web,worker" \
      com.mmdc.runtime.writable-paths="/tmp"

# The runtime needs neither a package manager nor Debian package indexes.
RUN rm -rf /var/lib/apt/lists/* \
    /etc/apt/sources.list \
    /etc/apt/sources.list.d \
    /root/.cache \
    /root/.npm \
    /usr/local/lib/node_modules/corepack \
    /usr/local/lib/node_modules/npm \
    /usr/local/bin/corepack \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/pnpm \
    /usr/local/bin/pnpx \
  && mkdir -p /app /tmp \
  && chown -R node:node /app /tmp

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

# The worker is intentionally the same runtime dependency graph and image as web.
# Its configuration imports the typed application modules directly with Node's
# built-in strip-types support; no development compiler is included.
COPY --from=builder --chown=node:node /app/payload.config.ts ./payload.config.ts
COPY --from=builder --chown=node:node /app/payload-types.ts ./payload-types.ts
COPY --from=builder --chown=node:node /app/src ./src
COPY --from=builder --chown=node:node /app/scripts/payload-worker.mjs ./scripts/payload-worker.mjs
COPY docker/container-entrypoint.mjs ./container-entrypoint.mjs

VOLUME ["/tmp"]
USER node
ENTRYPOINT ["node", "/app/container-entrypoint.mjs"]
CMD ["web"]
