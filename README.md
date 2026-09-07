# Arkyvree

A programmable ruleset engine for tabletop RPGs. 

Original idea and core architecture implemented by myself, the rest was done by Claude Code.

[Hosted app](https://rpg.arkyvree.com) · [Contributing](./CONTRIBUTING.md) · [Issues](https://github.com/PhilippeChab/arkyvree/issues) · [Security](./SECURITY.md)

## Prerequisites

- [Bun](https://bun.sh/) v1.3+
- [Docker](https://www.docker.com/) with Compose for PostgreSQL and local email

## Getting Started

1. Clone the repository and install dependencies

```bash
git clone https://github.com/PhilippeChab/arkyvree.git
cd arkyvree
git switch develop
bun install
```

2. Create local environment files from the supplied examples

```bash
cp .env.example .env
cp .env.test.example .env.test
```

3. Start the database and seed it

```bash
bun dev:db
bun dev:mail
bun dev:db:reset
```

The reset command deletes and recreates the configured development database.
Verify that `.env` points to the local `arkyvree_dev` database before running it.

4. Run the development server

```bash
bun dev
```

The app will be available at `http://localhost:5173`, the API at
`http://localhost:8000`, and the Mailpit inbox at `http://localhost:8025`.
`bun dev` runs the frontend, API, and background worker. Seeded local accounts
include `testuser1@example.com` with password `LocalTest123!`; use them only in
the disposable local setup.

Email/password development works without production service credentials. Google
sign-in and uploads require their own optional configuration; leave them
unconfigured unless you need to work on those features. The example environment
disables the hosted feedback integration and leaves monitoring credentials empty.

## Testing

```bash
# Start test database and seed it
bun test:db
bun test:db:reset

# Run unit/integration tests
bun run test

# Run E2E tests
bunx playwright install chromium
bun test:e2e

# Run everything
bun test:all
```

Tests use the separate local `arkyvree_test` database on port **5433**.
`test:db:reset` and Playwright's global setup delete and recreate that database.
Never point `.env.test` at production. Playwright starts its own API/frontend on
ports **8001/5175**; do not run it concurrently with other tests on the same DB.
See [CONTRIBUTING.md](./CONTRIBUTING.md#verification) for focused checks.

## Project Structure

```
client/
  src/
    components/         # Shared UI components (auth, characters, common, customization, layout)
    contexts/           # React contexts (toast, websocket)
    hooks/              # Shared hooks (useIsMobile, useDebouncedValue, usePrefetch)
    pages/              # Page components organized by domain
    services/           # RPC client
    stores/             # Zustand stores (auth)

server/
  routers/
    api/                # API routes organized by domain
      validation.ts     # Shared Zod schemas (pagination, sorting)
    authentication/     # Auth routes
    static.ts           # Static file serving + SEO
  services/
    campaigns/          # Campaign, player, invite services
    characters/         # Character, inventory, levels, modifiers services
      levels/           # Level-up wizard (slot queries, pick queries, finalize, batch)
    rulesets/            # Ruleset entity services (feats, powers, classes, etc.)
      customization/    # Modifiers, requirements, properties, target paths
    policies/           # Authorization policies
  repositories/         # Database access layer (Drizzle ORM)
  rulesets/             # Ruleset engine (DetailedCharacter, hooks, target paths)
    dnd3.5/             # D&D 3.5e-specific implementation
    universal/          # Base classes shared across systems
  middlewares/          # Session, rate limiting, request logging
  errors/               # Error classes
  cache/                # In-memory cache (ruleset COW data)

database/
  packages/             # Content packages (dnd35, extensions)

drizzle/
  schema.ts             # Database schema
  generated/            # Generated migrations

shared/                 # Types and utilities shared between client and server

tests/
  routers/              # API route tests
  services/             # Service-level tests
  characters/           # DetailedCharacter tests
  seeds/                # Seed data integrity tests
  cache/                # Cache tests
  e2e/                  # Playwright E2E tests
```

## Architecture

**3-layer backend:** Routers -> Services -> Repositories

- Routers handle HTTP, validation, and response formatting
- Services contain business logic and transaction management
- Repositories execute SQL queries via Drizzle ORM

**Ruleset system:** Rulesets support COW forking (edit inherited content without modifying the parent), extensions, publishing, and multi-contributor collaboration. See [docs/rulesets.md](./docs/rulesets.md).

**Character engine:** `DetailedCharacter` builds a complete character state from raw DB records, evaluating modifiers, requirements, and properties. Supports "projected" builds for simulating level-ups before committing.

## Community

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request, and target
`develop`. Community participation follows our [Code of Conduct](./CODE_OF_CONDUCT.md).
Use [GitHub issues](https://github.com/PhilippeChab/arkyvree/issues) for questions
and bug reports. Report security issues privately as described in [SECURITY.md](./SECURITY.md).
