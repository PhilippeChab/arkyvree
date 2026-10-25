# E2E Coverage

Reference index of every flow exercised by the Playwright suite under
`tests/e2e/`. Use this when adding new features to know what's already
covered and where new tests should slot in.

> **Suite stats:** 110 tests across 30 files, about two minutes on half the cores of a 20-core machine.

## Project layout & directory rules

The directory a file lives in maps directly to a Playwright project:

| Directory                                             | Project    | Auth state                                                      |
| ----------------------------------------------------- | ---------- | --------------------------------------------------------------- |
| `journeys/`                                           | `journeys` | Each test signs in itself, through the API, as users of its own |
| `auth/`, `navigation/unauthenticated-redirect.e2e.ts` | `guest`    | Signed out                                                      |

The run builds the client for production and serves it with the API from one server on port 8010 (`E2E_PORT`), on a
database of its own (`<name>_e2e_<port>`), copied from the e2e template (`<name>_e2e`) that `bun run test:db:reset`
refreshes. `E2E_SKIP_BUILD=1` reuses the last build; `E2E_COVERAGE=1` reports the
client code the run executes in `coverage/e2e` (per file in `coverage-summary.json`): each test's page, and the pages
of the contexts it opens with `openContext` (`signedInPage` included) until it closes them.

Helpers: `tests/e2e/support/`, a module per topic: `signIn.ts` (signing in through the API, the sign-in form, another
user's or a guest's context), `characters.ts` (a shared character opened), `campaigns.ts` and `rulesets.ts` (campaigns
and forks, through the API, and the pages they open), `contributors.ts` (invites and their answers), `page.ts` (names
no other test uses, since ruleset names are unique; the actions menu, list filters, API-response waits), `emails.ts`
(codes, OTP, signing up), `notifications.ts` and `api.ts` (`apiOf(page)`, the typed API through the page's browser
context); 3.5's own in `dnd3.5/`: `characters.ts` (creating characters and a character's first level, through the
API), `rulesets.ts` (its entities' customization pages, a Strength modifier) and `levelUp.ts` (the Add Level wizard);
`tests/e2e/fixtures.ts` (the `test` every file imports: worker-scoped `ownerUser` / `inviteeUser`, the test's `user`, the read-only `seedUser`, and coverage),
`tests/fixtures/auth.fixture.ts` (`TEST_USERS`).

---

## Accounts

| File                       | Coverage                                                                                                                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth/sign-in.e2e.ts`      | Valid creds → `/dashboard`; an unknown email and a wrong password get the same error; email-format validation                                                                                                                                     |
| `auth/sign-up.e2e.ts`      | Refuses an empty form, an invalid email, a short password, mismatched passwords, an email in use; the sign-in / sign-up links                                                                                                                     |
| `journeys/session.e2e.ts`  | A session opens the protected pages; signing out ends it, and the protected pages then send the user to `/sign-in`                                                                                                                                |
| `journeys/accounts.e2e.ts` | (1) Sign up → verify the email with the OTP read from the DB → onboarding wizard's 5 steps → Get Started. (2) Forgotten password: reset with the OTP from `account.password_resets`, then sign in with the new password                           |
| `journeys/profile.e2e.ts`  | Account-menu navigation; username update; refused emails (invalid, in use) and passwords (wrong current, mismatch, short); **email change with the full OTP cycle**; **password change and sign-in with it**. Each test changes a user of its own |

## Demo mode

| File                   | Coverage                                                                                                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `journeys/demo.e2e.ts` | (1) Start from `/sign-up`; the banner persists across in-app nav and the demo dies on `/sign-in`. (2) `/sign-in` in another tab of the same context ends the demo in the first. (3) **Mocked 401** after a demo start → `/demo-expired`, whose Sign-up CTA leads to `/sign-up` |

## Navigation & errors

| File                                         | Coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `navigation/unauthenticated-redirect.e2e.ts` | Unauthenticated `/dashboard`, `/campaigns`, `/characters` redirect to `/sign-in`                                                                                                                                                                                                                                                                                                                                                                                                      |
| `journeys/dnd3.5/pages.e2e.ts`                      | Every page loads with no uncaught error, console error or failed API call, and shows its content: the app's own pages (dashboard to legal); a fork's sections, its Settings among them, and its languages', skills', saves', mechanics', aptitudes' and abilities' pages; a class's four sections; the customization page and its two sections of a race, feat, item and spell; a character, a campaign's sections and its character's page, and the character's share link signed out |
| `journeys/error-handling.e2e.ts`             | A character submitted offline waits in its dialog (TanStack Query pauses the save) and is created, once, when the connection returns; a session cookie lost mid-visit sends the user to sign in                                                                                                                                                                                                                                                                                       |

---

## Rulesets

| File                                        | Coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `journeys/dnd3.5/rulesets.e2e.ts`                  | Fork starts Private and needs a name, then shows under Forked; rename + description persist through reload; archive → Archived view → unarchive; publish → Published chip + Community; star → Starred → unstar; the Feats search narrows and clearing restores; subscribing to Complete Arcane lists `Cloud Chariot` in the fork's spells, unsubscribing removes it                                                                                           |
| `journeys/dnd3.5/class-editing.e2e.ts`             | A class created in a fork (its hit die, and its Caster Type, a field its ruleset declares) opens on its Progression, its editor showing both; a level's base attack bonus, save and skill points show in the table after a reload; a class skill found by search stays after a reload, then is removed; an inherited monk's old Levels address opens its Progression, whose Good (full) preset and 6 skill points show in its table, stay through a visit to the Spells tab, and hold Back with a Discard Changes question until one save, which copies it into the fork, and after a reload |
| `journeys/dnd3.5/ruleset-entities.e2e.ts`          | A language, a mechanic, an aptitude, a save and a skill of a fork: each created from its section (which opens its page), renamed (surviving a reload), listed and opened under its new name, and deleted from its page; an inherited language renamed and saved is copied into the fork, its page moving to the copy and keeping its name after a reload; an address no simple kind has goes back to the ruleset                                              |
| `journeys/dnd3.5/fork-changes.e2e.ts`              | (1) Rename Human in a fork: the fork lists it, "Local Changes" narrows the races to it and toggles back, the core rules keep Human, and Restore in the Local Changes dialog leaves "No local changes". (2) The same restore for a feat, grouped under Feats. (3) A brand-new feat shows in the list and under Local changes                                                                                                                                   |
| `journeys/dnd3.5/customization.e2e.ts`             | A +2 Strength modifier on a race, a feat and a class level, each surviving a reload; a class level's Fortitude save and granted feats; a feat's fields (Weapon Finesse, a family) saved in its details' form, then a Requirement (`Strength ≥ 13`), surviving a reload                                                                                                                                                                                        |
| `journeys/dnd3.5/item-template-source.e2e.ts`      | At 375px and 1280px: a template has no source selector and stays editable; its variant keeps the selector                                                                                                                                                                                                                                                                                                                                                     |
| `journeys/dnd3.5/section-copies.e2e.ts`            | A fork's feats grouped by family: a family's row counts its variants and lists them as it expands, and Group Families off lists each feat; an item duplicated from its row (its copy's name, its page opening), then two variants of it made from its row and listed                                                                                                                                                                                          |
| `journeys/dnd3.5/ruleset-contributors.e2e.ts`      | Editor invitee accepts and renames a race the owner then sees; an invitee who rejects never gets the fork; a contributor who leaves loses it                                                                                                                                                                                                                                                                                                                  |
| `journeys/dnd3.5/cow-delete-race.e2e.ts`           | A requirement or a modifier created while the copied race is deleted or restored leaves no orphan rows (parallel HTTP requests, persisted state read from the DB)                                                                                                                                                                                                                                                                                             |
| `journeys/dnd3.5/cow-concurrent-first-edit.e2e.ts` | Eight concurrent first edits (modifiers) of an inherited race make one copy holding every one; the parent is untouched                                                                                                                                                                                                                                                                                                                                        |
| `journeys/dnd3.5/ruleset-settings.e2e.ts`          | A fork's Settings tab starts on its source's skill point ability (Intelligence), changes it to Wisdom and keeps it after a reload; adds levels 3 and 5 to Feat Advancement's more-at levels (its core frequency, every 3, and level 1 shown first), kept after a reload beside the core rules' ability increases (every 4)                                                                                                                                    |
| `journeys/dnd3.5/read-only-entities.e2e.ts`        | The core rules' Fireball, Longsword, Wizard and Swim, which no one edits, show the same fields as their page in a fork, in the same order, with their values (Fireball's School and Range, Longsword's Proficiency and Damage, Wizard's Caster Type and Bonus Spell Ability, Swim's armor check multiplier), every input read-only, a switch unchanged by a click, and no Save; the core rules' Settings show the skill point ability read-only, with no Save |

---

## Characters

| File                                     | Coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `journeys/dnd3.5/characters.e2e.ts`             | Create needs a name, a ruleset and a race (for a user who owns no ruleset), and opens the Add Level wizard once (closed, it stays closed through a rename); a user who owns one fork finds the dialog on it, its age empty, and keeps a ruleset picked before that answer lands; Import, from the link beside Create, reads a PCGen file's program, version, format and rules, imports it into Core SRD 3.5, shows its report (its race), whose Open Character goes to the new sheet; inline rename, archive → Archived → unarchive; ability scores raised and lowered from the sheet (lowering confirmed once a session) survive reloads; identity edits, private notes and a language added then removed survive reloads (a human of Intelligence 12: its Common fixed, with no remove control, Druidic not offered, none left to pick once its one pick is made); a share link shows the sheet, its class and level as text (a first level given through the API), with no levels to open, and its PDF to an anonymous viewer until revoked (404 + revoked alert); the owner's Download PDF queues a job (202 + snackbar; the job itself is `tests/jobs/dnd3.5/generatePdf.test.ts`); a runtime modifier added and removed in Manage Modifiers |
| `journeys/dnd3.5/character-inventory.e2e.ts`    | An amulet goes to the Neck slot, its quantity changes, it's removed; a longsword goes to Main Hand, then Two Handed; a dagger in each hand, as two entries, then a third's Add Item waits while its warning names them, until it's held in two other weapon sets ("Two Handed (Sets 2, 3)")                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `journeys/dnd3.5/level-up.e2e.ts`               | Fighter + Sorcerer levels in one pass, each class's levels offering Add Fighter Level / Add Sorcerer Level and neither Remove Last Level, the Sorcerer's plus opening Add Level with Sorcerer — Level 2 planned, which Cancel closes without asking, but asks to discard (Discard Progress) once Next and Back made it the user's plan; a fourth Fighter level's Strength increase; a Sorcerer's picked spells on the sheet; a feat found by search and a Weapon Focus variant through its family; each class on the header's line under the name, with its level; a class's levels opened from it, one's HP edited in Edit Level and read back there, then the ⋮ menu's Remove Last Level (confirmed), which leaves no class, nor its plus, on the line, the menu offering Add Level and Remove Last Level while there's a level and Add Level alone after, for a Fighter and a Sorcerer. Every wizard finishes without "Proceed Anyway"                                                                                                                                                                                                                                                                                                  |
| `journeys/dnd3.5/bonded-creatures.e2e.ts`       | A seeded familiar, animal companion and special mount: the master's sheet sums each up under the feat that bonds it and links to its sheet, whose header opens its class's levels without a level to add or edit, and whose Back returns to the master                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `journeys/character-contributors.e2e.ts` | A contributor accepts, lacks the owner's Share / Archive, renames the character the owner then sees; a contributor the owner removes loses it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

---

## Campaigns & notifications

| File                                  | Coverage                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `journeys/campaigns.e2e.ts`           | Create needs a ruleset; a new campaign is listed and renamed; archive → Archived → unarchive; the owner links their character publicly                                                                                                                                                                                                                                                                                       |
| `journeys/invite-links.e2e.ts`        | A campaign invite's email link: opened signed out, it signs in back to the invite, which accepted opens the campaign and then says it was accepted; rejected, it lands on the dashboard and then says so; anyone else, the GM included, doesn't find it; once the campaign is archived it can't be accepted. A ruleset contributor invite's link shows its role, and a character's, accepted, opens the ruleset or character |
| `journeys/campaign-invites.e2e.ts`    | An invitee who accepts joins, and the GM sees them as a player; an invitee who rejects stays out, the invite read and the bell down by one                                                                                                                                                                                                                                                                                   |
| `journeys/campaign-players.e2e.ts`    | The GM promotes a player to Game Master, revokes an invite to an email without an account, and removes another player, each kept after a reload                                                                                                                                                                                                                                                                              |
| `journeys/dnd3.5/campaign-visibility.e2e.ts` | A player links a Public, a Partial and a Private character: the GM sees all three whole, their private notes read-only, with Download PDF but not Edit Character; another player sees the Public one whole but its private notes, the Partial one without its build (its ability scores), and not the Private one (unlisted, its page not found)                                                                             |
| `journeys/realtime.e2e.ts`            | An open page's bell counts a new notification as the server pushes it over the websocket, without a reload (the push itself is asserted: the bell also refetches every minute)                                                                                                                                                                                                                                               |
| `journeys/notifications.e2e.ts`       | The bell counts an invite, accepts it inline and lands on the campaign, which leaves the bell; Mark all as read clears the GM's non-actionable rejections (dots gone, bell down by ≥ 2)                                                                                                                                                                                                                                      |

---

## Patterns

**Setup through the API.** Signing in, forking and creating characters and
campaigns go through `apiOf(page)`, whose requests carry (and set) the page's
cookies: a journey clicks through only what it tests. The sign-in form, the fork,
character and campaign dialogs, and invites have journeys of their own.

**Users of their own.** Journey tests sign in as users created as they're
used (`tests/e2e/fixtures.ts`): the worker's `ownerUser` and `inviteeUser`, for
tests that build their own content, and the test's own `user`, for one that
changes the user (email, password, session, stars). `seedUser`, the seeded
characters' owner, onboarded before any page loads, is for tests that only read
them. No test depends on another's order or leftovers, and a run takes any
number of workers.

**Selectors.** By role and accessible name (`getByRole('button', { name:
'More Actions' })`), never `data-testid`: the production build strips MUI
icons' test ids. A chip's delete icon is `.MuiChip-deleteIcon`.

**Multi-tab / multi-user flows.** Invite, share and contributor tests open
a second browser context for the other participant (`signedInPage`, or `openContext` for a guest) —
never a separate Page in the same context (cookies would leak). The demo's
cross-tab test is the exception: its two tabs share a context on purpose.

**API-response gates.** Tests that depend on async server work
(`createCharacter` waits for `/creation/race`; `answerInvite` waits for
the answer's `POST`; mark-all-read waits for `POST /read-all`) start
`apiResponse` (or `page.waitForResponse`) _before_ the triggering action to
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
- WebSocket updates beyond a notification's (`realtime.e2e.ts`): the activity feed's, and the new-version prompt, which needs the server's version to change mid-run
- Mobile UI (no mobile-specific Playwright project)
- Spells, items, class sections and customizations are edited in `customization.e2e.ts`, `class-editing.e2e.ts` and `item-template-source.e2e.ts` only, a ruleset's Settings in `ruleset-settings.e2e.ts`; `pages.e2e.ts` loads the rest
- Higher-level ability bumps (level 8 / 12 / 16 / 20 — level 4 covers the path)
- The hosted PDF download tail (worker → notification → blob) end to end in the browser.
  `tests/services/characters/dnd3.5/CharactersService.test.ts` checks enqueueing, `tests/jobs/dnd3.5/generatePdf.test.ts` runs the job
  (sheet rendered, export stored, player notified), and `bun run test:pdf-bundle` checks the compiled worker bundle.
