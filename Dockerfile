FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# PDFKit resolves its font modules at runtime; keep the upstream package intact.
FROM base AS pdf-runtime
COPY runtime/package.json runtime/bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts

# Build client + compile server, worker, and migration binaries
FROM deps AS build
ENV NODE_ENV=production
COPY . .
RUN bun run build \
  && bun build server/main.ts --compile --external pdfkit --compile-autoload-package-json --outfile server-bin \
  && bun build server/worker.ts --compile --external pdfkit --compile-autoload-package-json --outfile worker-bin \
  && bun build scripts/db/migrate.ts --compile --external pdfkit --compile-autoload-package-json --outfile migrate-bin

# Web image — server + migrations + static assets
FROM debian:bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0

COPY --from=build /app/server-bin ./server-bin
COPY --from=pdf-runtime /app/package.json ./package.json
COPY --from=pdf-runtime /app/node_modules ./node_modules
COPY --from=build /app/migrate-bin ./migrate-bin
COPY --from=build /app/dist ./dist
COPY public ./public
COPY drizzle ./drizzle

EXPOSE 8000

# Worker image — compiled worker and PDFKit runtime dependencies
FROM debian:bookworm-slim AS worker
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0

COPY --from=build /app/worker-bin ./worker-bin
COPY --from=pdf-runtime /app/package.json ./package.json
COPY --from=pdf-runtime /app/node_modules ./node_modules

EXPOSE 8001

# ---------------------------------------------------------------------------------------------------------------------
# Self-hosted image (docs/self-hosting.md): the server, the worker and PostgreSQL in one container, as ONCE runs it.
# Built for amd64 and arm64: the binaries are cross-compiled on the build machine, never emulated.

FROM --platform=$BUILDPLATFORM oven/bun:1 AS app-build
ARG TARGETARCH
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
ENV NODE_ENV=production
RUN target="bun-linux-$([ "$TARGETARCH" = arm64 ] && echo arm64 || echo x64)" \
  && bun run build \
  && for entry in server/main.ts:server-bin server/worker.ts:worker-bin scripts/db/migrate.ts:migrate-bin; do \
    bun build "${entry%%:*}" --compile --target="$target" --external pdfkit --compile-autoload-package-json \
      --outfile "${entry##*:}" || exit 1; \
  done

# PDFKit and its font modules are plain JavaScript: installed once, whatever the platform
FROM --platform=$BUILDPLATFORM oven/bun:1 AS app-pdf-runtime
WORKDIR /app
COPY runtime/package.json runtime/bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts

FROM debian:bookworm-slim AS app
# Their files outlive the image in the volume, so their users' ids never change: made before PostgreSQL's package,
# which would otherwise pick the next free ones
RUN groupadd --system --gid 999 postgres \
  && useradd --system --uid 999 --gid postgres --home-dir /var/lib/postgresql --shell /bin/bash postgres \
  && groupadd --system --gid 1000 arkyvree \
  && useradd --system --uid 1000 --gid arkyvree --no-create-home --shell /usr/sbin/nologin arkyvree
# PostgreSQL 17 from PostgreSQL's own repository; no cluster made at install, the entrypoint makes it in the volume
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && install -d /usr/share/postgresql-common/pgdg /etc/postgresql-common \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list \
  && echo "create_main_cluster = false" > /etc/postgresql-common/createcluster.conf \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-17 \
  && apt-get purge -y curl \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/* \
  && test "$(id -u postgres):$(id -u arkyvree)" = "999:1000"
WORKDIR /app
ENV NODE_ENV=production
ENV PATH=/usr/lib/postgresql/17/bin:$PATH

COPY --from=app-build /app/server-bin /app/worker-bin /app/migrate-bin ./
COPY --from=app-pdf-runtime /app/package.json ./package.json
COPY --from=app-pdf-runtime /app/node_modules ./node_modules
COPY --from=app-build /app/dist ./dist
COPY public ./public
COPY drizzle ./drizzle
COPY docker/lib.sh /usr/local/lib/arkyvree/lib.sh
COPY docker/entrypoint.sh /usr/local/bin/arkyvree
COPY docker/hooks /hooks

VOLUME /storage
EXPOSE 80
ENTRYPOINT ["/usr/local/bin/arkyvree"]
