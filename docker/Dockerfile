# The self-hosted image; the hosted instance's images, Fly's web and worker, are the root Dockerfile's.
# The server, the worker and PostgreSQL in one container, as ONCE runs it (docs/self-hosting.md). Built from the
# repository's root, which the root .dockerignore filters: `docker build -f docker/Dockerfile .`. Built for amd64 and
# arm64: the binaries are cross-compiled on the build machine, never emulated.

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
