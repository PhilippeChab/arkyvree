# Contributing to Arkyvree

Bug reports, focused fixes, documentation improvements, and accessibility work
are welcome. Please follow the [Code of Conduct](./CODE_OF_CONDUCT.md).
This is a maintainer-led project: opening a proposal does not guarantee that
it will be implemented, and review times depend on availability.

## Before starting

- Search existing [issues](https://github.com/PhilippeChab/arkyvree/issues) and pull requests.
- Discuss substantial features, architecture changes, dependencies, or new game packages first.
- Keep pull requests focused; avoid unrelated formatting or generated-data churn.
- Report vulnerabilities privately using [SECURITY.md](./SECURITY.md), not public issues.

## Local setup

Use **Bun**, not npm, Yarn, or pnpm. Install Bun 1.3+ and Docker with Compose,
then follow [Getting Started](./README.md#getting-started). The repository includes
safe `.env.example` and `.env.test.example` templates. Never use production
credentials or a production database for development or testing.

The development workflow uses PostgreSQL on port 5432. The separate test
database uses port 5433. Mailpit is available for local email; real Resend,
Google, storage, and monitoring credentials are not required for basic local work.
Uploads require separately configured S3-compatible storage.

## Working on code

[AGENTS.md](./AGENTS.md) documents the project's coding conventions for both
human and automated contributors. In particular:

- Use strict TypeScript and Hono's inferred RPC types; do not add `any`.
- Preserve the router → service → repository architecture. All service mutations use transactions.
- Follow existing policies, repository instances, and copy-on-write rules.
- Build mobile-first and reuse the shared dialog, form, and loading components.
- Use the normal seeded test database; do not replace integration coverage with mocks.
- Update the relevant documentation when behavior or setup changes.

For game data, follow [Content Packages](./docs/packages.md) and the
[parser guide](./database/packages/dnd35-from-parser/README.md). Do not manually
edit generated files or rewrite old migrations to fix deployed data. Use the
documented mapping and package-update workflow.

## Verification

For code changes, run:

```bash
bunx tsgo --noEmit
bun run lint
bun run build
```

For database-backed tests:

```bash
bun test:db
bun test:db:reset
bun run test
```

**The reset command deletes and recreates the database configured in `.env.test`.**
Check the target first. `bun run test` provisions worker databases from the
seeded test database; use the existing scripts rather than inventing another setup.

For browser changes:

```bash
bunx playwright install chromium
bun test:e2e
```

Playwright starts its own servers on ports 8001 and 5175 and resets the test
database during global setup. Do not run it alongside other tests using that
same database. See [AGENTS.md](./AGENTS.md) for test-directory/authentication
mapping and shared fixtures. During development, a focused run is fine, for example:

```bash
bun test:e2e tests/e2e/journeys/ruleset-fork.e2e.ts --project=journeys
```

Describe what you actually ran in your pull request, including any checks you
could not run. Do not disable or skip failing tests to obtain a green result.

## Pull requests

1. Create a branch from `develop` and target `develop` in your pull request.
2. Explain the problem, the change, and relevant trade-offs; link the issue if there is one.
3. Include reproduction steps or appropriately scoped tests for changed behavior.
4. Include desktop and mobile screenshots for visible UI changes, without personal data.
5. Call out migrations, package version changes, configuration changes, and breaking changes.

`main` is the deployment branch; normal contributions should not target it.
Never include `.env` files, credentials, database dumps, user exports, or private
activity logs. Avoid installing packages with another package manager or adding
a second lockfile.

## Contribution licensing

By submitting original code or documentation for inclusion, you agree to license
that contribution under the project's GNU General Public License version 3 only
(`GPL-3.0-only`, see [LICENSE](./LICENSE)) and confirm that you have
the right to do so. This does not transfer ownership of your contribution.

Third-party content must keep its own compatible license and attribution.
For game-content contributions, provide the exact upstream source, its explicit
reuse grant, and the required notices. A publicly accessible website, scraped
text, or a claim of rules compatibility is not a substitute for permission.
Do not submit material you cannot authorize us to redistribute.

See [LICENSE](./LICENSE) for software licensing and [OGL.md](./OGL.md) for
game-content licensing.
