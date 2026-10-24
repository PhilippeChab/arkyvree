# Working on Arkyvree with Claude

[AGENTS.md](./AGENTS.md) holds the project's conventions, which every change follows. This file adds how Claude works
here, locally and in cloud sessions.

## Cloud sessions (Claude Code on the web)

- **Startup:** a SessionStart hook ([.claude/settings.json](./.claude/settings.json), running
  [scripts/cloud/session-start.sh](./scripts/cloud/session-start.sh)) readies every cloud session. It starts
  PostgreSQL, installs the dependencies, writes `.env.test` from `.env.test.example`, seeds the test database (again
  only when its seeds change), and fetches `origin/develop`, the base `bun run test:changed` diffs against. Its first
  message says what's ready; its log is `/tmp/cloud-session-start.log`. Locally it does nothing.
- **GitHub:** requests go through Anthropic's proxy, which rejects GitHub's GraphQL API, so `gh pr …` and `gh issue …`
  fail with a 403. Use the REST API instead:
  - open a pull request: `gh api repos/PhilippeChab/arkyvree/pulls -f title="…" -f head="$(git branch --show-current)" -f base=develop -F body=@body.md`
  - open an issue: `gh api repos/PhilippeChab/arkyvree/issues -f title="…" -F body=@body.md -f "labels[]=bug"`
  - comment on one: `gh api repos/PhilippeChab/arkyvree/issues/<number>/comments -F body=@comment.md`
  - read a commit's checks: `gh api repos/PhilippeChab/arkyvree/commits/$(git rev-parse HEAD)/check-runs --jq '.check_runs[] | .name + " " + (.conclusion // .status)'`
- **Database:** `.claude/settings.json` lets Claude run SQL through the Neon tools without asking
  (`mcp__Neon__run_sql`). Against production it only reads (`SELECT`); a write goes to a throwaway Neon branch made for
  a check, which is deleted after it.
- **No end-to-end tests:** CI runs them on every pull request. In the cloud, Playwright's own browser isn't installed,
  and the end-to-end server binds IPv6 (`HOST=::`), which the container lacks.
- **Screenshots:** a Chromium is installed (`/opt/pw-browsers/chromium`): Playwright drives it with
  `launchOptions: { executablePath: "/opt/pw-browsers/chromium" }`, against a server bound to `127.0.0.1`. Take each
  change's before (a `develop` worktree) and after in the same state, put them side by side on an Artifact page, and
  link the page from the pull request: `--attach` doesn't work in the cloud. The page is private until it's shared from
  its Share menu.

## Issues and pull requests

- **Issues:** an issue's title starts with its area (`Engine:`, `Client:`, `Server:`, `Codegen:`…), and it's labeled
  `bug` or `enhancement`.
- **Pull requests:**
  - A pull request targets `develop`, and its title starts with its area too.
  - Its body opens with a **Premise** (the behavior reproduced before changing it), then what changed and the checks
    run.
  - A user interface change attaches before and after screenshots (`--attach` on `gh pr create`, `gh pr edit` or
    `gh pr comment`, outside the cloud; in the cloud, an Artifact page, as **Screenshots** says).
- **Public repo:**
  - Never name production users, their characters or their rulesets.
  - Never link a Claude session in a commit, a pull request or an issue. `.claude/settings.json` turns off the cloud's
    own session links (`attribution.sessionUrl`).
- **Changelog:** [CHANGELOG.md](./CHANGELOG.md) lists new user-visible features only, one plain phrase each: no bug
  fixes, refactors or detail.
- **Merging:** a pull request merges once every check is green on its current head, squashed.
