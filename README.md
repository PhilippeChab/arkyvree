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
    components/         # Shared UI by domain (auth, characters, common, contributors, customization, icons, invites, layout, notifications, onboarding, rulesets)
    contexts/           # React contexts (theme, snackbar, websocket)
    hooks/              # Shared hooks (useIsMobile, useListParams, useListboxQuery, useFormSync, …)
    lib/                # The query client, shared queries and keys, formatters, validation rules
    pages/              # Pages by domain, each with its own components, hooks and queries
    services/           # RPC client and its ApiError
    stores/             # What the browser keeps: Zustand stores (auth, user preferences, dirty forms), storage guards
    theme/              # The theme: palette, components' looks, animations, global styles

server/
  main.ts               # The web server; worker.ts, the background worker
  environment.ts        # Every environment variable the server reads
  routers/
    application.ts      # The app: middleware, the error envelope, the routes
    api/                # API routes organized by domain
      validation.ts     # Shared Zod schemas (params, pagination, sanitized text)
    authentication/     # Auth routes: signedOut/, then signedIn/ behind the session
    static.ts           # Static file serving + SEO (the shell: PageTemplates.ts)
    ws.ts               # The websocket; health.ts, the health probe
  services/             # One folder per service, laid out like routers/api
    activities/         # Activity log and the notifications it sends
    attachments/        # Uploaded images (avatars, portraits)
    authentication/     # Sign in / up, demo, account, linked accounts
    campaigns/          # Campaign, player, invite, campaign character services
    characters/         # Character, inventory, levels, modifiers, contributors, sharing services
      levels/           # Level-up wizard (slot queries, pick queries, finalize): reads, asks the engine, writes
    dashboard/          # Dashboard statistics
    exports/            # PDF exports
    notifications/      # Notifications
    policies/           # Authorization policies
    rulesets/           # Ruleset and ruleset entity services (feats, powers, classes, etc.)
      customization/    # Modifiers, requirements, properties, target paths
  repositories/         # Database access layer (Drizzle ORM), in folders by domain; concerns/, the mixins they include
  cache/                # In-memory cache (a ruleset's rows, its COW data, its target paths)
  cow/                  # Copy-on-write's writes: the copy of an inherited entity, the rows a change writes
  database/             # Database connection, transactions, request-scoped query cache, job queue
  middlewares/          # Session, validation, rate limiting, request logging, demo gate
  errors/               # Error classes
  jobs/                 # Background jobs run by the worker (PDF export, emails, cleanup)
  emails/               # Email sending (templates in emails/)
  storage/              # S3 attachment storage
  websockets/           # Server events pushed to the client

engine/                 # The ruleset engine: computes a ruleset's rules over the rows it's given, reads and writes nothing
  index.ts              # Its one entry, Engine: the handles the server, the seeders and the codegen ask
  api/                  # Engine and its handles, each bound to a view and what it's about, asking the ruleset's module
  core/                 # Machinery: modifiers, requirements, the path language, the ruleset view, COW data, the module's contract
  rulesets/dnd3.5/      # D&D 3.5e: the character, its components by domain, its entities, level-ups and printed sheet

lib/                    # What the engine and the server share: the mixins (include)

content/
  core/                 # What every ruleset's content is written with: the customization builders, the seed types they share, a package's and a test character's shape
  dnd3.5/               # The 3.5 content, data: its builders, its hand-written rows, the generated books, its packages, its test characters

codegen/
  dnd3.5/               # The SRD scraper and generator: reference files, and the tools that write content/dnd3.5/generated

database/
  packages/             # The content packages' runner and registry: each base rules' packages, seeder and test characters, which a database gets
  seeders/              # What writes content to the database: core/ (ContentSeeder, a seeder's contract, and the steps every ruleset's content seeds alike), dnd3.5/ (its seeder)
  seeds/                # The dev and test seed scripts (users, each base rules' test characters, through the registry)

drizzle/
  schema.ts             # Database schema (and relations.ts), pulled from the database
  NNNN_*.sql, meta/     # Migrations, generated by drizzle-kit

shared/                 # Types and pure helpers shared by the client, the server and the database packages
vocabulary/
  dnd3.5/               # The 3.5 vocabulary, data only: its lists, labels, tables and bounds, which the engine, the client, the content and the codegen read
emails/                 # Email templates (React Email)
scripts/                # Database scripts (reset, migrate, seed) and ops scripts (prod diff, impersonate, validation)
docs/                   # Developer docs
help/                   # The user-facing help, linked from the app

tests/
  routers/              # API route tests, through the typed client
  services/             # Service-level tests
  engine/               # The engine: its machinery, its operations, the 3.5 module's characters, level-ups and sheets
  cache/                # Cache tests
  cow/                  # Copy-on-write's server part: the views it composes
  seeds/                # The seeders, the seeded content, the package runner, the test data
  codegen/              # The codegen, mirrored: its core's tools, each ruleset's parser tools
  jobs/                 # Background jobs
  emails/               # The email service and its templates
  middlewares/          # Rate limits, error wrapping
  shared/               # Shared code, and its enums against the schema
  vocabulary/           # A ruleset's vocabulary
  scripts/              # The database scripts' guards, the prod diff
  lint/                 # The repo's own lint rules, and the docs that name them
  client/               # Client logic that needs no browser
  e2e/                  # Playwright E2E tests
  fixtures/             # Playwright's setup and auth fixture, the PDF bundle check's document
  support/              # Shared test helpers, one module per topic, a ruleset's own in a folder of its name (dnd3.5/)
```

## Architecture

**3-layer backend:** Routers -> Services -> Repositories

- Routers handle HTTP, validation, and response formatting
- Services contain business logic and transaction management
- Repositories execute SQL queries via Drizzle ORM

**Ruleset system:** Rulesets support COW forking (edit inherited content without modifying the parent), extensions, publishing, and multi-contributor collaboration. See [docs/rulesets.md](./docs/rulesets.md).

**Ruleset engine:** `engine/` computes every ruleset rule over the data the server reads, through one entry, `Engine` (`engine/index.ts`): a handle bound to a ruleset's view and to what its rules are about (`Engine.for(scope).character(input).describe(…)`), whose operations take a character's rows or a request's body, and answer descriptions, plans of the writes the server makes, or refusals. A ruleset's module (`engine/rulesets/dnd3.5/`) builds a complete character state from its rows, evaluating modifiers, requirements, and properties, and projects level-ups before they're saved.

## Community

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request, and target
`develop`. Community participation follows our [Code of Conduct](./CODE_OF_CONDUCT.md).
Use [GitHub issues](https://github.com/PhilippeChab/arkyvree/issues) for questions
and bug reports. Report security issues privately as described in [SECURITY.md](./SECURITY.md).
