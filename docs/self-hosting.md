# Self-hosting

Arkyvree runs on your own server as one Docker image, `ghcr.io/philippechab/arkyvree`: the app, its background worker
(PDFs, emails, cleanup) and its PostgreSQL database in one container, with everything it keeps in one folder,
`/storage`. Install it with [ONCE](https://github.com/basecamp/once), or with Docker alone.

The code is under the [Elastic License 2.0](../LICENSE): you may run it for yourself and your group, but not offer it to
others as a hosted or managed service.

## What it needs

- A Linux server (amd64 or arm64) with Docker, **2 CPU cores** and **2 GB of memory**. Measured on a running install:
  about 350 to 450 MB of memory idle, about 520 MB while drawing a character's PDF.
- About 1 GB of disk for the image, plus your data: a new install's `/storage` holds about 260 MB (its database, about
  70 MB with the bundled rulesets, and PostgreSQL's own files).
- A domain name pointing at the server, for HTTPS (ONCE gets the certificate).
- **A mail provider.** Arkyvree emails a code to confirm each new account's address, and sends invites and password
  reset codes. Any provider with SMTP works: your Gmail or Google Workspace account (with an
  [app password](https://support.google.com/accounts/answer/185833)), or a service such as Postmark, Brevo, Mailgun or
  Amazon SES. Until email is set up, Arkyvree shows a page saying what's missing instead of the app.

## Installing with ONCE

1. On the server: `curl https://get.once.com | sh`.
2. When ONCE asks which app to install, enter the image: `ghcr.io/philippechab/arkyvree:latest`.
3. Enter the hostname people will open Arkyvree at (`rpg.example.com`). ONCE sets up HTTPS for it.
4. In ONCE's settings, open **Email** and enter your mail provider's SMTP server, port, user, password and the address
   emails come from. Arkyvree restarts with them.
5. Open the address and sign up. **The first account to confirm its email becomes the admin.**

ONCE passes Arkyvree its address (`BASE_URL`), a secret (`SECRET_KEY_BASE`) and the email settings; Arkyvree needs
nothing else.

### Example: a Gmail account

| Setting | Value |
|---|---|
| Server | `smtp.gmail.com` |
| Port | `587` |
| User | your Gmail address |
| Password | an app password from your Google account (it needs 2-Step Verification) |
| From address | your Gmail address |

Gmail sends from that address only, with its daily sending limits: fine for a group, not for a public site.

## After installing

- **Who can sign up:** the admin page (Admin, in the sidebar) sets it: Open (anyone), Invite Only (people with an
  invite to a campaign, a ruleset or a character, or an admin's invite link), or Closed. A new install starts on
  Invite Only once its admin exists.
- **Accounts:** the admin page lists them; an admin makes another admin, deactivates an account, or marks its email
  verified when a code never arrived.

## Backups and restoring

ONCE backs up `/storage` every day and keeps 30 days. Before each backup it runs the image's `/hooks/pre-backup`, which
writes a consistent copy of the database to `/storage/backup/arkyvree.dump`. Restoring a backup in ONCE runs
`/hooks/post-restore`, which rebuilds the database from that copy. Uploaded files (`/storage/files`) are backed up as
they are.

A backup that comes while Arkyvree is still starting (ONCE's automatic update and its daily backup come due on the same
check, so a backup can follow an update by seconds) waits up to 90 seconds for the database before copying it.

**Keep backups private.** Besides your data, each ONCE backup holds the install's settings in plain text: the email
password, the image registry's password if one is set, and the secret (`SECRET_KEY_BASE`) Arkyvree signs upload links
with. Store them where only you can read them.

## Updates

With automatic updates on, ONCE checks the image's `latest` tag and updates the install when a new version is
published. ONCE starts the new version beside the old one, waits for it to answer, then removes the old one at once.
Meanwhile the new one answers an "Arkyvree is updating" page: once the old one is gone, it starts its database (which
recovers from the old one's abrupt stop, as PostgreSQL does after a power cut) and applies the new version's database
changes, still answering that page, until the app takes over. Expect the updating page for a few seconds to a minute.

**An update can't be undone automatically**: once the new version has changed the database, the old one can't run on
it. To go back after an update that went wrong: in ONCE's settings, set the image to the previous version's tag
(`ghcr.io/philippechab/arkyvree:0.8.0` rather than `latest`, with automatic updates off), then restore a backup from
before the update (ONCE keeps one a day), which brings back the database as it was then.

Only one Arkyvree runs on a volume at a time. A second container started by hand on the same volume answers the
updating page until the first one stops: stop the first, or give the second its own volume.

## Without ONCE: Docker alone

```sh
docker volume create arkyvree
docker run -d --name arkyvree --restart unless-stopped \
  -p 80:80 -v arkyvree:/storage \
  -e BASE_URL=https://rpg.example.com \
  -e SMTP_ADDRESS=smtp.gmail.com -e SMTP_PORT=587 \
  -e SMTP_USERNAME=you@gmail.com -e SMTP_PASSWORD='your app password' \
  -e MAILER_FROM_ADDRESS='Our Table <you@gmail.com>' \
  ghcr.io/philippechab/arkyvree:latest
```

- The container serves plain HTTP on port 80: put a proxy that handles HTTPS in front (Caddy, Traefik, nginx), or, on
  a home network without HTTPS, set `BASE_URL` to its `http://` address (sign-in then works over plain HTTP).
- Without `SECRET_KEY_BASE` or `SIGNING_SECRET`, Arkyvree makes a secret and keeps it in the volume.
- **Backup:** `docker exec arkyvree /hooks/pre-backup`, then copy the volume (the dump is in its `backup` folder).
- **Restore:** put the copy in a new volume, run `/hooks/post-restore` in a container from the image on that volume
  with Arkyvree stopped (`docker run --rm -v arkyvree-restored:/storage --entrypoint /hooks/post-restore
  ghcr.io/philippechab/arkyvree:latest`), then start Arkyvree on it.
- **Update:** `docker pull ghcr.io/philippechab/arkyvree:latest`, then remove and run the container again with the same
  volume.

## Settings

| Setting | What it does |
|---|---|
| `BASE_URL` (or `APP_URL`) | The address people open Arkyvree at, with `https://` or `http://`. ONCE sets it |
| `SECRET_KEY_BASE` (or `SIGNING_SECRET`) | Signs upload links. ONCE sets it; otherwise one is made and kept in the volume |
| `SMTP_ADDRESS`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `MAILER_FROM_ADDRESS` | Email, as ONCE's Email settings set them. Port 587 by default |
| `SMTP_TLS` | `starttls` (the default), `implicit` (port 465's default), or `none` for a local relay |
| `DATABASE_URL` | Another PostgreSQL to use (a managed one, Neon): the bundled one doesn't start, and that database keeps its own backups |
| `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL` | All five: uploads go to an S3-compatible bucket instead of `/storage/files` |
| `GOOGLE_CLIENT_ID` | Turns on Google sign-in |
| `ROLE` | `all` (the default), or `web` / `worker` to run the two apart; both need `DATABASE_URL` |
| `WORKER_CONCURRENCY` | How many jobs (PDFs, emails) run at once: 1 by default here |

## How the image is tested

Every pull request that changes the image (`docker/Dockerfile`, what it runs), and every release before it's published,
tests it through ONCE (`scripts/once/test.sh`, run by `.github/workflows/app-image.yml`), as a self-hoster would use it:

1. ONCE installs the latest published release, with Mailpit as its email server.
2. The test signs up through the app's own pages' requests, reads the code from the verification email, and checks
   that the account is the admin. It creates a character and uploads its portrait.
3. It publishes the new image under the same tag and runs `once update`, polling the site every half second: no request
   may fail (the "Arkyvree is updating" page may answer meanwhile). A backup runs right after the update, while the new
   version still starts, and must hold the database's dump. Then the account still signs in, the portrait still loads,
   the app runs the new image, and its database holds every migration the image ships.
4. It exports the character's PDF through the public API, which the background worker draws.
5. It backs up, removes the install with its data, restores the backup, and signs in again; then it stops and starts
   the app, and signs in again.

Each week, and on demand, the same test also leaves ONCE's own background runner on for a few minutes, with automatic
updates and backups: a new image is published, and the runner must update the install and back it up by itself.

On your own machine, `bun run test:once` runs the same test against an image built from your working tree
(`bun run test:once --image ghcr.io/philippechab/arkyvree:0.8.0` tests a published one, `--background` adds the
background runner). It runs in a Docker-in-Docker container of its own, so ONCE never touches your computer's Docker or
its ports 80 and 443, and removes everything when it ends. It needs Docker, and takes a few minutes.

`bun run once:try` is the hands-on version: the same isolated install, kept running, with ONCE's own screen open in your
terminal. Open http://arkyvree.localhost:8080 to use the app (sign up: the first account is the admin) and
http://127.0.0.1:8026 for Mailpit, which holds the emails it sends, the verification code among them. Quitting ONCE's
screen removes everything. `ONCE_TRY_PORT` and `ONCE_TRY_MAIL_PORT` change the two ports. Browsers open
`*.localhost` addresses on your own computer by themselves; a command-line tool may not (`curl -H 'Host:
arkyvree.localhost:8080' http://127.0.0.1:8080/` reaches it all the same).

## Not supported

- More than one copy of the app running at once with uploads on disk: each would keep its own files. Use S3 for that.
- A worker on another machine than the app with uploads on disk, for the same reason.
