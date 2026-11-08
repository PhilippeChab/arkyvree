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
git switch main
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

## Architecture

**3-layer backend:** Routers -> Services -> Repositories

- Routers handle HTTP, validation, and response formatting
- Services contain business logic and transaction management
- Repositories execute SQL queries via Drizzle ORM

**Ruleset system:** Rulesets support COW forking (edit inherited content without modifying the parent), extensions, publishing, and multi-contributor collaboration. See [docs/rulesets.md](./docs/rulesets.md).

**Ruleset engine:** `engine/` computes every ruleset rule over the data the server reads, through one entry, `Engine` (`engine/index.ts`): a handle bound to a ruleset's view and to what its rules are about (`Engine.for(scope).character(input).describe(…)`), whose operations take a character's rows or a request's body, and answer descriptions, plans of the writes the server makes, or refusals. A ruleset's module (`engine/rulesets/dnd3.5/`) builds a complete character state from its rows, reading its fields and evaluating modifiers and requirements, and projects level-ups before they're saved.

## Community

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request, and target
`main`. Community participation follows our [Code of Conduct](./CODE_OF_CONDUCT.md).
Use [GitHub issues](https://github.com/PhilippeChab/arkyvree/issues) for questions
and bug reports. Report security issues privately as described in [SECURITY.md](./SECURITY.md).

## License

The code is under the [Elastic License 2.0](./LICENSE): you may use, copy, modify and distribute it, but not provide
it to others as a hosted or managed service. The game content from the System Reference Document, and the game
mechanics of the Pathfinder Roleplaying Game Core Rulebook, are Open Game Content under the
[Open Game License 1.0a](./OGL.md). The System Reference Document 5.2.1's material is under the Creative Commons
Attribution 4.0 International License, attributed in [OGL.md](./OGL.md#system-reference-document-521).
