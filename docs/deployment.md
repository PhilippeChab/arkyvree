# Deployment

Arkyvree runs on **Fly.io** as two apps sharing one `Dockerfile`. CI handles build, test, and deploy on push to `main`.

## Topology

| App | Purpose | Public? | Scaling |
|---|---|---|---|
| `arkyvree` | Hono API + WebSocket + static client | Yes, `rpg.arkyvree.com` via Cloudflare | `suspend` on idle, `min = 0` |
| `arkyvree-worker` | graphile-worker (PDFs, email, cron) | No — Flycast only | `stop` on idle, `min = 0` |

Why two apps: the worker is Flycast-only so it never has a public attack surface, and the web process doesn't need the PDF/email task code in its binary. Shared `Dockerfile` uses build targets (`web`, `worker`) so deps + build stages cache across both.

## Waking the worker

graphile-worker runs in the worker app. Jobs are enqueued from the web process via `SELECT graphile_worker.add_job(...)`. Enqueue-only is enough to queue a job, but it won't run while the worker is stopped. After every `add_job`, the web process calls `pingWorker()` (`server/queue.ts`) which does a fire-and-forget `fetch` to `http://arkyvree-worker.flycast:8001/health`. Fly Proxy routes the request, wakes the machine, graphile-worker polls and picks up the pending job.

`WORKER_FLYCAST_URL` env var controls the ping target. Unset in local/test → `pingWorker()` no-ops.

## Suspend vs stop

- **Web uses `suspend`** (memory snapshot, ~200ms wake). Users wait on web, so cold-start speed matters. WS LISTEN client and DB pool both have reconnect logic for the stale-socket problem that suspend/resume produces.
- **Worker uses `stop`** (full VM destroy, ~2-3s wake). graphile-worker's internal LISTEN client has wedged in testing after suspend/resume — reconnect fires but polling doesn't actually resume. `stop` avoids the problem by booting a fresh process every time.

Worker wake is internal (Flycast ping from web), so the 2-3s cost is invisible to users.

## First-time setup

Bootstrap a fresh deployment.

```sh
# 1. Create both apps in the same org
fly apps create arkyvree --org personal
fly apps create arkyvree-worker --org personal

# 2. Allocate a private IPv6 on the worker for Flycast routing.
#    Without this, arkyvree-worker.flycast won't resolve and pingWorker()
#    silently fails — jobs queue but the worker never wakes.
fly ips allocate-v6 --private -a arkyvree-worker

# 3. Set secrets on both apps (full list under "Environment variables")
fly secrets set <KEY>=<VALUE> ... -a arkyvree
fly secrets set <KEY>=<VALUE> ... -a arkyvree-worker

# 4. First deploy — web gets public IPs auto-allocated from [[services]]
fly deploy --remote-only --config fly.web.toml --app arkyvree
fly deploy --remote-only --config fly.worker.toml --app arkyvree-worker

# 5. Scale each app to 1 machine. Fly creates 2 by default for HA on first
#    deploy — overkill at our volume and doubles the cost. Reversible later.
fly scale count web=1 -a arkyvree --yes
fly scale count worker=1 -a arkyvree-worker --yes

# 6. Import the Cloudflare Origin CA cert for the custom domain. Generate it
#    in Cloudflare first — full flow under "Custom domain". Not `fly certs
#    add`: ACME can't renew behind the proxy.
fly certs import rpg.arkyvree.com --fullchain origin-cert.pem --private-key origin-key.pem -a arkyvree

# 7. Create the CI deploy token, save as FLY_API_TOKEN repo secret
fly tokens create deploy -o personal
```

After the Fly side is up:

- **Resend sending domain** — add `arkyvree.com` in the Resend dashboard, copy the printed DNS records (SPF on `send`, DKIM on `resend._domainkey`, MX on `send`, DMARC on `_dmarc`) into Cloudflare DNS-only.
- **Custom domain DNS** — Cloudflare records for `rpg.arkyvree.com`. See "Custom domain" below.

> **Gotcha**: `fly apps create` is the low-level "make me an empty app" command — it doesn't allocate IPs, configure Flycast, or set up secrets. `fly launch` does more of this automatically by reading the toml, but with two apps sharing one Dockerfile we create each app explicitly and handle the rest manually. Step 2 (private IPv6 allocation) is the one easy to miss — the symptom is jobs accumulating in `graphile_worker._private_jobs` while the worker stays stopped, with no error in any log.

## Configuration

```
fly.web.toml        # web app config, build_target = "web"
fly.worker.toml     # worker app config, build_target = "worker"
Dockerfile          # shared; two final stages: web and worker
```

Both configs use `primary_region = "iad"` to match US-East Neon.

### Environment variables

Set via `fly secrets set -a <app>`. Same set on both apps unless noted.

| Name | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | both | Neon pooled connection |
| `DIRECT_DATABASE_URL` | both | Neon direct connection (no `-pooler`). Required for LISTEN/NOTIFY — pgbouncer doesn't support session features |
| `RESEND_API_KEY` | both | Email via Resend |
| `GOOGLE_CLIENT_ID` | web | OAuth |
| `GITHUB_TOKEN`, `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME` | web | Feedback → GitHub issues |
| `APP_URL` | both | Email links + logo image (worker — `EmailLayout` reads it at render time), CORS allowed origin and OG meta (web), canonical-host redirect (web) |
| `WORKER_FLYCAST_URL` | web | `http://arkyvree-worker.flycast:8001/health` |
| `SENTRY_DSN` | both | Server/worker error reporting via Better Stack's Sentry-compatible ingest (unset = disabled) |
| `SENTRY_CLIENT_DSN` | web | Browser error reporting, injected into `window.__APP_CONFIG__` (unset = disabled) |
| `SENTRY_TRACES_SAMPLE_RATE` | both | Optional, defaults to `0` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | both | Better Stack OTLP ingest base URL (unset = metrics push disabled) |
| `OTEL_AUTH_TOKEN` | both | Better Stack OTLP source token (wrapped in `Authorization: Bearer ...` at runtime) |

## Custom domain

`rpg.arkyvree.com` → Fly via Cloudflare, proxied (orange cloud) with SSL/TLS mode **Full (strict)**.

Origin TLS is a **Cloudflare Origin CA certificate**, not Let's Encrypt. This is deliberate — read the gotcha below before changing it.

1. Cloudflare → **SSL/TLS → Origin Server → Create Certificate**. Cover `arkyvree.com`, `*.arkyvree.com`, `rpg.arkyvree.com`; validity **15 years**. The private key is displayed once — copy both PEM blocks before leaving the page.
2. `fly certs import rpg.arkyvree.com --fullchain origin-cert.pem --private-key origin-key.pem -a arkyvree`
3. Add the `_fly-ownership` TXT record Fly prints, as a **DNS-only** record. This is how Fly verifies domain ownership when it can't reach the origin through the proxy.
4. A + AAAA records → the Fly IPs, **proxied (orange cloud)**
5. SSL/TLS mode → **Full (strict)**. Origin CA certs are built for strict mode; `Flexible` causes a redirect loop against `force_https` in `fly.web.toml`
6. Delete the local PEM files — the private key belongs in the password manager, not the repo

The current cert expires **2041-07-22**. Nothing renews it and nothing will warn you.

> **Gotcha**: ACME/Let's Encrypt (`fly certs add`) does not survive behind Cloudflare's proxy. It issues fine while records are gray-clouded, then silently fails every renewal once they go orange — Cloudflare intercepts HTTP-01 challenges, and DNS-01 collides with Cloudflare Universal SSL's own hidden `_acme-challenge` TXT records. The existing cert keeps working for its full 90-day life, so nothing looks wrong: CI stays green, logs stay clean. On expiry day Fly drops the hostname from its SNI map and Cloudflare starts returning **525 SSL handshake failed**. This took production down on 2026-07-26, roughly 90 days after the domain was first set up in late April. Origin CA removes the renewal cycle entirely.

Leave any previously-added ACME cert registered as a fallback. Fly serves the custom cert as primary and falls back to ACME automatically, which matters if the records are ever gray-clouded — Origin CA certs are trusted only by Cloudflare, so a browser reaching Fly directly will reject them.

WebSocket works through Cloudflare's proxy. The 30s client-side ping heartbeat keeps connections inside Cloudflare's ~100s idle kill window.

### Canonical-host enforcement

Fly has no toggle to disable the default `*.fly.dev` hostname, so a Hono middleware in `server/routers/application.ts` 301-redirects any request whose `Host` header doesn't match `new URL(APP_URL).host` to the canonical origin. Search engines consolidate authority at the custom domain instead of splitting it across both URLs. `/health` is exempt so Fly probes still pass, and the middleware only activates when `NODE_ENV` is `production` or `staging`.

## CI/CD

Single workflow: `.github/workflows/ci.yml`.

```
build ─┐
       ├── deploy (matrix: web + worker)
tests ─┘
```

- `build`, `api-tests-*`, `e2e-tests` run in parallel
- API tests split by trigger:
  - **Push** to main/develop → `api-tests-full`, sharded 3× via `bun test --shard` (matrix jobs in parallel)
  - **PR** → `api-tests-changed`, single job using `bun test --changed=origin/<base>` — only runs tests affected by the diff
- `deploy` needs `build`, `api-tests-full`, `e2e-tests` and runs on push to `main` only
- Deploy is a matrix over `{fly.web.toml, fly.worker.toml}` — both apps deploy in parallel

`FLY_API_TOKEN` must be at **repository-level** secrets (Settings → Secrets and variables → Actions → Repository secrets). The deploy job doesn't declare an `environment:`, so environment-scoped secrets won't be visible.

Create a token: `fly tokens create deploy -o personal`.

## Logging

`console.*` is replaced at startup with synchronous `fs.writeSync` to stdout/stderr (`server/log.ts`). This prevents Bun's default pipe-buffering from dropping trailing lines on VM shutdown.

**Known caveat**: logs emitted in the first ~1-1.5s of a cold boot can still be dropped. Fly's Vector collector doesn't ingest immediately on process start. Nothing app-side fixes this — it'd require a log drain (Better Stack / Axiom) to cover. Currently accepted.

**Source of truth for job success is the database, not the logs.** If `account.exports` has a row, the PDF was generated, regardless of whether you see the completion log.

## Debugging

```sh
# Machine state (started / stopped / suspended)
fly machine list -a arkyvree
fly machine list -a arkyvree-worker

# Live logs
fly logs -a arkyvree
fly logs -a arkyvree-worker

# Force-wake a stopped worker
fly machine start <id> -a arkyvree-worker

# Check deployed image / commit
fly image show -a arkyvree-worker    # look for GH_SHA label

# Inspect queue state (requires .env.production DATABASE_URL)
# - pending jobs: SELECT * FROM graphile_worker._private_jobs
# - queue locks: SELECT * FROM graphile_worker._private_job_queues
# - recent exports: SELECT * FROM account.exports ORDER BY created_at DESC
```

### Common issues

- **Worker woke but job isn't processed** — graphile-worker's LISTEN client wedged post-suspend. We use `stop` on the worker to prevent this; if it happens, `fly machine restart <id>` clears it. If it happens frequently, verify the worker is on `stop` not `suspend`.
- **WS updates not delivered to client** — check `[ws] Broadcast listener started` appears in web logs. If only `[ws] Heartbeat failed` appears without a reconnect log, the LISTEN client wedged. See `server/ws.ts` heartbeat + scheduleReconnect path.
- **Deploy fails with "no access token available"** — `FLY_API_TOKEN` isn't reachable from the deploy job. Check it's at repo-level, not environment-level.
- **Cloudflare 525 SSL handshake failed** — Cloudflare can't complete TLS to the origin; the app itself is usually fine. Get the IP from `fly ips list -a arkyvree`, then compare two SNIs against it:
  ```sh
  echo | openssl s_client -connect <fly-ip>:443 -servername rpg.arkyvree.com
  echo | openssl s_client -connect <fly-ip>:443 -servername arkyvree.fly.dev
  ```
  A healthy origin negotiates a cipher; a broken one closes with `unexpected eof while reading` and `Cipher is (NONE)`. If `arkyvree.fly.dev` succeeds (Fly's own `*.fly.dev` cert) while the custom hostname fails, the origin cert for that hostname is missing or expired — check `fly certs list -a arkyvree`, not the app. `Verify return code: 21` against the Origin CA cert is expected: it isn't public-PKI, only Cloudflare trusts it.
- **Scale-to-zero not kicking in** — web uses `requests`-based concurrency; open WS connections don't block idle. But if any client is actively making HTTP requests (including the PWA checking for updates), the idle timer resets. Close the browser tab.
