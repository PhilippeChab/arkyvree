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
- **No end-to-end tests:** Playwright's browsers aren't installed in the cloud. CI runs the end-to-end tests on every
  pull request.

## Issues and pull requests

- **Issues:** an issue's title starts with its area (`Engine:`, `Client:`, `Server:`, `Codegen:`…), and it's labeled
  `bug` or `enhancement`.
- **Pull requests:**
  - A pull request targets `develop`, and its title starts with its area too.
  - Its body opens with a **Premise** (the behavior reproduced before changing it), then what changed and the checks
    run.
  - A user interface change attaches before and after screenshots (`--attach` on `gh pr create`, `gh pr edit` or
    `gh pr comment`, outside the cloud).
- **Public repo:**
  - Never name production users, their characters or their rulesets.
  - Never link a Claude session in a commit, a pull request or an issue. `.claude/settings.json` turns off the cloud's
    own session links (`attribution.sessionUrl`).
- **Changelog:** [CHANGELOG.md](./CHANGELOG.md) lists new user-visible features only, one plain phrase each: no bug
  fixes, refactors or detail.
- **Merging:** a pull request merges once every check is green on its current head, squashed.
