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
  && bun build scripts/db/migrate.ts --compile --outfile migrate-bin

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
COPY server/landing.html ./server/landing.html

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
