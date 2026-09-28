# E2E Coverage

Reference index of every flow exercised by the Playwright suite under
`tests/e2e/`. Use this when adding new features to know what's already
covered and where new tests should slot in.

> **Suite stats:** 85 tests across 23 files.

## Project layout & directory rules

The directory a file lives in maps directly to a Playwright project,
which controls auth state at startup:

| Directory | Project | Auth state |
|---|---|---|
| `journeys/` | `journeys` | None — each test signs in itself |
| `auth/`, `navigation/unauthenticated-redirect.e2e.ts` | `guest` | None |
| `profile/`, `session/`, `navigation/protected-routes.e2e.ts` | `authenticated` | Pre-loaded `testuser1` storageState |

Helpers: `tests/e2e/helpers.ts` (sign-in, character and campaign creation,
forking, invites and their answers, the actions menu, list filters,
API-response waits, OTP), `tests/e2e/levelUpHelpers.ts` (the Add Level
wizard), `tests/e2e/fixtures.ts` (worker-scoped `ownerUser` / `inviteeUser`
from a testuser4–19 pool), `tests/fixtures/auth.fixture.ts` (`TEST_USERS`).

---

## Accounts

| File | Coverage |
|---|---|
| `auth/sign-in.e2e.ts` | Valid creds → `/dashboard`; an unknown email and a wrong password get the same error; email-format validation |
| `auth/sign-up.e2e.ts` | Refuses an empty form, an invalid email, a short password, mismatched passwords, an email in use; the sign-in / sign-up links |
| `session/sign-out.e2e.ts` | Sign out clears the session and redirects to `/sign-in` |
| `journeys/accounts.e2e.ts` | (1) Sign up → verify the email with the OTP read from the DB → onboarding wizard's 5 steps → Get Started. (2) Forgotten password: reset with the OTP from `account.password_resets`, then sign in with the new password |
| `profile/profile-edit.e2e.ts` | Account-menu navigation; username update; refused emails (invalid, in use) and passwords (wrong current, mismatch, short); **email change with the full OTP cycle on testuser2**, then restored; **password change and sign-in with it on testuser3**, then restored |

## Demo mode

| File | Coverage |
|---|---|
| `journeys/demo.e2e.ts` | (1) Start from `/sign-up`; the banner persists across in-app nav and the demo dies on `/sign-in`. (2) `/sign-in` in another tab of the same context ends the demo in the first. (3) **Mocked 401** after a demo start → `/demo-expired`, whose Sign-up CTA leads to `/sign-up` |

## Navigation & errors

| File | Coverage |
|---|---|
| `navigation/protected-routes.e2e.ts` | Authenticated user can reach protected routes |
| `navigation/unauthenticated-redirect.e2e.ts` | Unauthenticated `/dashboard`, `/campaigns`, `/characters` redirect to `/sign-in` |
| `journeys/error-handling.e2e.ts` | A character submitted offline waits in its dialog (TanStack Query pauses the save) and is created, once, when the connection returns; a session cookie lost mid-visit sends the user to sign in |

---

## Rulesets

| File | Coverage |
|---|---|
| `journeys/rulesets.e2e.ts` | Fork needs a name, then shows under Forked; rename + description persist through reload; archive → Archived view → unarchive; publish → Published pill + Community; star → Starred → unstar; the Feats search narrows and clearing restores; subscribing to Complete Arcane lists `Cloud Chariot` in the fork's spells, unsubscribing removes it |
| `journeys/fork-changes.e2e.ts` | (1) Rename Human in a fork: the fork lists it, "Local changes" narrows the races to it and toggles back, the core rules keep Human, and Restore in the Local changes dialog leaves "No local changes". (2) The same restore for a feat, grouped under Feats. (3) A brand-new feat shows in the list and under Local changes |
| `journeys/customization.e2e.ts` | A +2 Strength modifier on a race, a feat and a class level, each surviving a reload; a class level's Fortitude save and granted feats; a Property and a Requirement (`Strength ≥ 13`) on a feat, surviving a reload |
| `journeys/item-template-source.e2e.ts` | At 375px and 1280px: a template has no source selector and stays editable; its variant keeps the selector |
| `journeys/ruleset-contributors.e2e.ts` | Editor invitee accepts and renames a race the owner then sees; an invitee who rejects never gets the fork; a contributor who leaves loses it |
| `journeys/cow-delete-race.e2e.ts` | A customization created while the copied race is deleted or restored leaves no orphan rows (parallel HTTP requests, persisted state read from the DB) |
| `journeys/cow-concurrent-first-edit.e2e.ts` | Eight concurrent first edits of an inherited race make one copy holding every property; the parent is untouched |

---

## Characters

| File | Coverage |
|---|---|
| `journeys/characters.e2e.ts` | Create needs a name, a ruleset and a race; inline rename, archive → Archived → unarchive; identity edits and a language added then removed survive reloads; a share link shows the sheet and its PDF to an anonymous viewer until revoked (404 + revoked alert); the owner's Download PDF queues a job (202 + snackbar; the job itself is `tests/jobs/generatePdf.test.ts`); a runtime modifier added and removed in Manage Modifiers |
| `journeys/character-inventory.e2e.ts` | An amulet goes to the Neck slot, its quantity changes, it's removed; a longsword goes to Main Hand, then Two Handed |
| `journeys/level-up.e2e.ts` | Fighter + Sorcerer levels in one pass; a fourth Fighter level's Strength increase; a Sorcerer's picked spells on the sheet; a feat found by search and a Weapon Focus variant through its family; editing a level's HP then removing it, for a Fighter and a Sorcerer. Every wizard finishes without "Proceed Anyway" |
| `journeys/character-contributors.e2e.ts` | A contributor accepts, lacks the owner's Share / Archive, renames the character the owner then sees; a contributor the owner removes loses it |

---

## Campaigns & notifications

| File | Coverage |
|---|---|
| `journeys/campaigns.e2e.ts` | Create needs a ruleset; a new campaign is listed and renamed; archive → Archived → unarchive; the owner links their character publicly |
| `journeys/campaign-invites.e2e.ts` | An invitee who accepts joins, and the GM sees them as a player; an invitee who rejects stays out, the invite read and the bell down by one |
| `journeys/notifications.e2e.ts` | The bell counts an invite, accepts it inline and lands on the campaign, which leaves the bell; Mark all as read clears the GM's non-actionable rejections (dots gone, bell down by ≥ 2) |

---

## Patterns

**Worker-scoped users.** Journey tests pull `ownerUser` and `inviteeUser`
from a per-worker pool (`testuser4–11` and `testuser12–19`). Tests in
`profile/` that mutate user state use `testuser2` (email change) and
`testuser3` (password change) under `test.use({ storageState: empty })`
so they're isolated from the worker pool.

**Multi-tab / multi-user flows.** Invite, share and contributor tests open
a second browser context for the other participant (`signedInPage`) —
never a separate Page in the same context (cookies would leak). The demo's
cross-tab test is the exception: its two tabs share a context on purpose.

**API-response gates.** Tests that depend on async server work
(`createCharacter` waits for `/available-races`; `answerInvite` waits for
the answer's `POST`; mark-all-read waits for `POST /read-all`) start
`apiResponse` (or `page.waitForResponse`) *before* the triggering action to
avoid race conditions.

**Settle-then-act after navigation.** `toHaveCount(0)` passes instantly
when there's no match (e.g., a just-archived ruleset is gone from
`/rulesets`), so it doesn't actually wait for the page to render. Pair it
with an `expect(<persistent element>).toBeVisible()` — the Core SRD card
on `/rulesets`, the page heading after reload — before interacting with
the next UI. Clicks against an unsettled tree race with React's
post-navigation render.

**Menu items: scope to the open menu.** `page.getByRole('menuitem', ...)`
can race with sibling menus or transitions under parallel load. After
clicking the menu trigger: `await expect(page.getByRole('menu')).toBeVisible()`
then `menu.getByRole('menuitem', ...)`. `openActionsMenu` and `filterList` do
this for the actions and Filter menus.

**Autocomplete picks: split the wait from the click.**
`getByText('...').click({ timeout: ... })` buries the wait inside the click
action and produces confusing failures when the option is slow to render.
Do `await expect(option).toBeVisible({ timeout: ... })` then
`await option.click()` so the wait is explicit.

**Snackbar vs sticky UI.** The queued snackbar can auto-dismiss before a
test polls for it; tests that follow a save with a sticky UI element
(verify dialog, list row, banner) assert on that element instead of the
snackbar text.

## Deliberately out of scope

Per project decisions, these are not e2e-tested:

- Real email mailer (we read OTPs from the DB)
- Real S3 file uploads (3rd-party, would require sandbox)
- WebSocket realtime updates beyond what's incidentally exercised
- Mobile UI (no mobile-specific Playwright project)
- Higher-level ability bumps (level 8 / 12 / 16 / 20 — level 4 covers the path)
- The hosted PDF download tail (worker → notification → blob) end to end in the browser.
  `tests/services/CharactersService.test.ts` checks enqueueing, `tests/jobs/generatePdf.test.ts` runs the job
  (sheet rendered, export stored, player notified), and `bun run test:pdf-bundle` checks the compiled worker bundle.
