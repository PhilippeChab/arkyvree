# Arkyvree

A programmable ruleset engine for tabletop RPGs. 

Original idea and core architecture implemented by myself, the rest was done by AI agents.

[Hosted app](https://rpg.arkyvree.com) · [Help](./help/README.md) · [Changelog](./CHANGELOG.md) · [Contributing](./CONTRIBUTING.md) · [Issues](https://github.com/PhilippeChab/arkyvree/issues) · [Security](./SECURITY.md) · [Support on Ko-fi](https://ko-fi.com/philippechab)

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
leaves monitoring credentials empty.

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
`test:db:reset` deletes and recreates that database; `bun run test` runs on copies
of it, the other test commands on it directly, and Playwright on a copy of its own.
Never point `.env.test` at production. Playwright serves the built client and the
API on port **8010**.
See [CONTRIBUTING.md](./CONTRIBUTING.md#verification) for focused checks.

## Project Structure

```
client/
  src/
    components/         # Shared UI components (auth, characters, common, contributors, customization, invites, layout, onboarding)
    contexts/           # React contexts (theme, toast, websocket)
    hooks/              # Shared hooks (useIsMobile, useListParams, useListboxQuery, useFormSync, …)
    lib/                # Query factories and keys, formatters, type guards, helpers
    pages/              # Page components organized by domain
    services/           # RPC client
    stores/             # Zustand stores (auth, user preferences, dirty forms)
    types/              # Client-only types

server/
  routers/
    api/                # API routes organized by domain
      validation.ts     # Shared Zod schemas (pagination, sorting)
    authentication/     # Auth routes
    static.ts           # Static file serving + SEO
  services/             # One folder per service, laid out like routers/api
    campaigns/          # Campaign, player, invite services
    characters/         # Character, inventory, levels, modifiers services
      levels/           # Level-up wizard (slot queries, pick queries, finalize): reads, asks the engine, writes
    rulesets/           # Ruleset entity services (feats, powers, classes, etc.)
      customization/    # Modifiers, requirements, properties, target paths
    policies/           # Authorization policies
  repositories/         # Database access layer (Drizzle ORM), in folders by domain
  cow/                  # Copy-on-write's writes: the copy of an inherited entity, the rows a change writes
  middlewares/          # Session, rate limiting, request logging
  errors/               # Error classes
  cache/                # In-memory cache (a ruleset's rows, its COW data, its target paths)
  database/             # Database connection and request-scoped query cache
  jobs/                 # Background jobs run by the worker (PDF export, emails, cleanup)
  emails/               # Email templates and sending
  storage/              # S3 attachment storage

engine/                 # The ruleset engine: computes a ruleset's rules over the rows it's given, reads and writes nothing
  index.ts              # Its one entry: the operations the server, the seeders and the codegen call
  api/                  # The operations, each dispatched to the ruleset's module by its base rules
  core/                 # Machinery: modifiers, requirements, the path language, the ruleset view, COW data, the module's contract
  rulesets/dnd3.5/      # D&D 3.5e: the character, its components by domain, its entities, level-ups and printed sheet

content/
  dnd3.5/               # The 3.5 content: its builders, its hand-written data, the generated books

codegen/
  dnd3.5/               # The SRD scraper and generator: reference files, and the tools that write content/dnd3.5/generated

database/
  packages/             # Content packages (dnd35, extensions), their runner and seeders
  seeds/                # Development seed data (users, characters)

drizzle/
  schema.ts             # Database schema (and relations.ts), pulled from the database
  NNNN_*.sql, meta/     # Migrations, generated by drizzle-kit

shared/                 # Types and utilities shared between client and server

tests/
  routers/              # API route tests
  services/             # Service-level tests
  engine/               # The engine: character computation, target paths, requirements, level-ups, sheets
  seeds/                # Seed data integrity tests
  cache/                # Cache tests
  client/               # Client logic that needs no browser
  e2e/                  # Playwright E2E tests
```

## Architecture

**3-layer backend:** Routers -> Services -> Repositories

- Routers handle HTTP, validation, and response formatting
- Services contain business logic and transaction management
- Repositories execute SQL queries via Drizzle ORM

**Ruleset system:** Rulesets support COW forking (edit inherited content without modifying the parent), extensions, publishing, and multi-contributor collaboration. See [docs/rulesets.md](./docs/rulesets.md).

**Ruleset engine:** `engine/` computes every ruleset rule over the data the server reads, through one entry (`engine/index.ts`): its operations take a ruleset's view, a character's rows or a request's body, and answer descriptions, plans of the writes the server makes, or refusals. A ruleset's module (`engine/rulesets/dnd3.5/`) builds a complete character state from its rows, evaluating modifiers, requirements, and properties, and projects level-ups before they're saved.

## Community

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request, and target
`develop`. Community participation follows our [Code of Conduct](./CODE_OF_CONDUCT.md).
Use [GitHub issues](https://github.com/PhilippeChab/arkyvree/issues) for questions
and bug reports. Report security issues privately as described in [SECURITY.md](./SECURITY.md).
