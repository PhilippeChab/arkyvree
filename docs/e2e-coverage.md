# E2E Coverage

Reference index of every flow exercised by the Playwright suite under
`tests/e2e/`. Use this when adding new features to know what's already
covered and where new tests should slot in.

> **Suite stats:** 96 tests across 49 files. Validated under 5 consecutive
> parallel runs (workers=4) at 91/91 clean before later additions; current
> suite at 96/96 in the most recent full validation run.

## Project layout & directory rules

The directory a file lives in maps directly to a Playwright project,
which controls auth state at startup:

| Directory | Project | Auth state |
|---|---|---|
| `journeys/` | `journeys` | None — each test signs in itself |
| `auth/`, `navigation/unauthenticated-redirect.e2e.ts` | `guest` | None |
| `profile/`, `session/`, `navigation/protected-routes.e2e.ts` | `authenticated` | Pre-loaded `testuser1` storageState |

Helpers: `tests/e2e/helpers.ts` (sign-in, character creation, OTP),
`tests/e2e/levelUpHelpers.ts` (Add Level wizard walkthrough),
`tests/e2e/fixtures.ts` (worker-scoped `ownerUser` / `inviteeUser` from a
testuser4–19 pool).

---

## Authentication

| File | Coverage |
|---|---|
| `auth/sign-in.e2e.ts` | Valid creds → `/dashboard`; invalid creds error; email-format validation |
| `auth/sign-up.e2e.ts` | Sign up → `/verify-email`; empty/invalid/short-password validation; password-mismatch validation |
| `session/sign-out.e2e.ts` | Sign out clears session and redirects to `/sign-in` |
| `journeys/forgot-password.e2e.ts` | Full reset flow: request OTP → read from DB → set new password → sign in with it |
| `journeys/onboarding.e2e.ts` | Fresh sign-up + email verify + onboarding wizard (all 5 steps) → Get Started |

## Demo mode

| File | Coverage |
|---|---|
| `journeys/demo-mode.e2e.ts` | Three tests: (1) start demo from `/sign-in`, banner persists across in-app nav, dies on `/sign-in` re-entry; (2) `/demo-expired` page renders + Sign-up CTA; (3) **mocked 401** on next API call after demo start sets the flag and redirects to `/demo-expired` |
| `journeys/demo-cross-tab.e2e.ts` | Tab A in demo + Tab B opens `/sign-in` → Tab A's next API call hits the dead session, lands on `/sign-in` or `/demo-expired` |

## Profile

| File | Coverage |
|---|---|
| `profile/profile-edit.e2e.ts` | Account-menu navigation; current-info display; username update; email-format validation; password-mismatch; short-password; **email change with full OTP cycle on testuser2** (read code from DB, verify, restore); **password update with sign-in using new password, then restore** |
| `journeys/character-identity-edit.e2e.ts` | Edit alignment, deity, age + add/remove a Language; all changes persist after `page.reload()` |

## Navigation & permissions

| File | Coverage |
|---|---|
| `navigation/protected-routes.e2e.ts` | Authenticated user can reach protected routes |
| `navigation/unauthenticated-redirect.e2e.ts` | Unauthenticated `/characters` (and friends) redirect to `/sign-in` |
| `journeys/error-handling.e2e.ts` | Unauthorized access bounces to sign-in; invalid login credentials surface the error; offline POST keeps the dialog open instead of advancing; session expiration after cookie-clear redirects to sign-in |

---

## Rulesets

### Lifecycle

| File | Coverage |
|---|---|
| `journeys/ruleset-fork.e2e.ts` | Fork SRD → Forked filter; empty-name validation |
| `journeys/ruleset-archive.e2e.ts` | Archive a fork → Archived view → unarchive restores |
| `journeys/ruleset-publish.e2e.ts` | Publish draft → Published pill + Community filter visibility |
| `journeys/ruleset-edit.e2e.ts` | Rename + change description on a fork; persists after reload |
| `journeys/ruleset-star.e2e.ts` | Star a ruleset, see it under Starred filter, unstar, gone |

### COW (copy-on-write) edits

| File | Coverage |
|---|---|
| `journeys/cow-edit-race.e2e.ts` | Rename Human in a fork; base SRD's Human is untouched |
| `journeys/childonly-filter.e2e.ts` | "Local changes" toggle on a section page narrows the list to the fork's overrides; toggling off restores the inherited list |

### Customization (modifiers / properties / requirements / new entities)

| File | Coverage |
|---|---|
| `journeys/customization-add-modifier.e2e.ts` | Add +2 Strength modifier to Human race in a fork |
| `journeys/customization-feat-modifier.e2e.ts` | Add +1 Strength modifier to Toughness feat in a fork |
| `journeys/customization-class-level.e2e.ts` | (1) Add a generic modifier to Fighter Level 1; (2) edit klass_levels-distinctive fields — change Fortitude Save base, remove a Bonus Feat chip — and confirm both round-trip a reload |
| `journeys/customization-properties-and-requirements.e2e.ts` | Add a custom Property AND a Requirement (`Strength == 13`) to Toughness in a fork; both rows persist after reload. Uses the React-tracker setter to drive the controlled `<input type="number">` reliably |
| `journeys/customization-add-feat.e2e.ts` | Create a brand-new feat in a fork (not a shadow override) — feat appears in list and in the local-changes view |

### Overrides & extensions

| File | Coverage |
|---|---|
| `journeys/override-management.e2e.ts` | Open the Local Changes dialog after renaming a Race; assert "modified" chip; click Restore; dialog flips to "No local changes" |
| `journeys/override-management-feat.e2e.ts` | Same flow for a Feat override — proves the dialog is class-of-entity-agnostic |
| `journeys/extension-subscribe.e2e.ts` | Subscribe to "Complete Arcane SRD 3.5" → fork's Spells tab now lists `Cloud Chariot`; unsubscribe removes it |

### Contributors

| File | Coverage |
|---|---|
| `journeys/ruleset-contributor-invite.e2e.ts` | Owner invites Editor → invitee accepts + edits a Race name → owner sees the rename |
| `journeys/contributor-invite-reject.e2e.ts` | Invitee rejects via `/notifications` page; fork doesn't appear in invitee's Shared list |
| `journeys/contributor-revocation.e2e.ts` | (1) Editor invitee leaves a fork — loses access; (2) owner removes a character contributor — contributor's Shared view loses the character |

---

## Characters

### Lifecycle

| File | Coverage |
|---|---|
| `journeys/character-create-validation.e2e.ts` | Empty submit shows "Name is required" + "Ruleset is required"; partial fills don't navigate |
| `journeys/character-archive.e2e.ts` | Archive → Archived filter → unarchive restores |
| `journeys/character-rename.e2e.ts` | Inline rename via heading click + Save |
| `journeys/character-identity-edit.e2e.ts` | Edit alignment / deity / age, add+remove a language, persist through reload |
| `journeys/character-share.e2e.ts` | Generate share token; anonymous browser-context viewer sees the sheet; revoke kills the link (URL shows the "not available or revoked" Alert + 404 response) |
| `journeys/character-share-pdf.e2e.ts` | Anonymous viewer downloads the PDF — file size > 0, content-type `application/pdf` |
| `journeys/character-download-pdf-owner.e2e.ts` | Owner clicks Download PDF → POST `/characters/:id/pdf` returns 202 + queued snackbar (the worker tail is covered by `tests/services/CharactersService.test.ts`) |

### Inventory

| File | Coverage |
|---|---|
| `journeys/character-inventory.e2e.ts` | Test 1: add Amulet of Health +2 (auto-equip Neck slot via the item-detail response wait), edit quantity, delete. Test 2: equip a Longsword to Main Hand (with `Proceed Anyway` warning path), then re-equip to Two Handed |
| `journeys/manage-character-modifiers.e2e.ts` | Open Manage Modifiers dialog, add a runtime +1 STR modifier, see the row, delete it, BlankState returns |

### Level-up wizard

| File | Coverage |
|---|---|
| `journeys/level-up.e2e.ts` | Fighter happy path: queue 2 levels, walk all wizard steps (Class Plan → HP Max All → Attribute → Skills Auto → Feats fill-every-pool → Spells → Review) — no "Proceed Anyway" |
| `journeys/level-up-caster.e2e.ts` | Sorcerer level: same walkthrough but the Spells step picks 4 cantrips + 2 first-level spells; assert each picked spell appears in the on-sheet Spells display after finalize |
| `journeys/level-up-multiclass.e2e.ts` | One Fighter + one Sorcerer level in the same wizard pass; both classes appear on the sheet |
| `journeys/level-up-attribute-increase.e2e.ts` | Take 4 Fighter levels in one pass; the Attribute step at level 4 requires picking a stat — pick Strength, assert "Level: +1" lands on the Strength card |
| `journeys/level-up-search-feat.e2e.ts` | At the Feats step, search "Toughness" and pick that specific row; then expand the Weapon Focus family and pick "Weapon Focus: Longsword"; both feats land on the on-sheet Feats display |
| `journeys/level-edit-and-remove.e2e.ts` | (1) Fighter — add a level, edit HP via the Edit Level dialog, save, then Remove Level + confirm. (2) Sorcerer — same shape against a caster (proves dialogs aren't Fighter-specific) |

### Contributors

| File | Coverage |
|---|---|
| `journeys/character-contributor-invite.e2e.ts` | Owner invites contributor → invitee accepts + inline-renames the character → owner sees the new name |
| `journeys/contributor-viewer-scope.e2e.ts` | Non-owner contributor on a character: MoreVert menu lacks Share + Archive (gated on `isOwner`). Note: the codebase doesn't actually distinguish viewer vs editor for character contributors — every invite stamps `role: "Editor"`. The owner-vs-non-owner distinction is what the test verifies |

---

## Campaigns

| File | Coverage |
|---|---|
| `journeys/campaign-crud.e2e.ts` | Create → list refresh; rename via Edit menu; archive + unarchive |
| `journeys/campaign-invite.e2e.ts` | GM invites by email; invitee accepts via the notification; campaign appears in invitee's list AND on the campaign detail page as Active |
| `journeys/campaign-invite-reject.e2e.ts` | Invitee rejects via `/notifications`; campaign doesn't appear in their list |
| `journeys/link-character-to-campaign.e2e.ts` | Owner links own character to own campaign with Public visibility; appears in roster |

---

## Notifications

| File | Coverage |
|---|---|
| `journeys/notifications.e2e.ts` | Invitee sees an unread bell badge after a campaign invite; opens the bell, clicks Accept inline, lands on the campaign; bell badge clears below baseline |
| `journeys/notifications-mark-read.e2e.ts` | (1) Invitee on `/notifications` rejects an actionable invite via Reject; the row's actionable buttons disappear and the bell drops by 1. (2) GM context — invitee already rejected both invites, so the GM has 2 *non-actionable* `rejectCampaignInvite` notifications. Mark-All-Read flips them: unread Circle dots disappear and the bell drops by ≥ 2 |

---

## Account capacity

| File | Coverage |
|---|---|
| `journeys/character-capacity.e2e.ts` | Fresh signup can create a seventh character |
| `journeys/campaign-capacity.e2e.ts` | Fresh signup can create a third campaign |
| `journeys/fork-capacity.e2e.ts` | Fresh signup can create a second public fork |

---

## List / section UI

| File | Coverage |
|---|---|
| `journeys/list-search-sort.e2e.ts` | On the SRD's Feats tab — typing into the search input narrows the table; clearing restores the full first page. Note: the Feats section doesn't expose a sort menu in the current UI, so sort isn't asserted |

---

## Patterns

**Worker-scoped users.** Journey tests pull `ownerUser` and `inviteeUser`
from a per-worker pool (`testuser4–11` and `testuser12–19`). Tests in
`profile/` that mutate user state use `testuser2` (email change) and
`testuser3` (password change) under `test.use({ storageState: empty })`
so they're isolated from the worker pool.

**Multi-tab / multi-user flows.** Invite, share, contributor, and
demo-cross-tab tests open a second `browser.newContext()` for the other
participant — never a separate Page in the same context (cookies would
leak).

**API-response gates.** Tests that depend on async server work
(`createCharacter` waits for `/available-races`; reject-invite flows
wait for `POST /reject`; mark-all-read waits for `POST /read-all`) use
`page.waitForResponse` set up *before* the triggering action to avoid
race conditions.

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
then `menu.getByRole('menuitem', ...)`.

**Autocomplete picks: split the wait from the click.**
`getByText('...').click({ timeout: ... })` buries the wait inside the click
action and produces confusing failures when the option is slow to render.
Do `await expect(option).toBeVisible({ timeout: ... })` then
`await option.click()` so the wait is explicit.

**Snackbar vs sticky UI.** The queued snackbar can auto-dismiss before a
test polls for it; tests that follow a save with a sticky UI element
(verify dialog, list row, banner) assert on that element instead of the
snackbar text.

**Featurebase disabled in tests.** `FEATUREBASE_ENABLED=false` is set on
the vite command in `playwright.config.ts` so the third-party iframe
doesn't inject `role="dialog"` elements that would compete with MUI
dialogs in selectors.

## Deliberately out of scope

Per project decisions, these are not e2e-tested:

- Real email mailer (we read OTPs from the DB)
- Real S3 file uploads (3rd-party, would require sandbox)
- WebSocket realtime updates beyond what's incidentally exercised
- Mobile UI (no mobile-specific Playwright project)
- Higher-level ability bumps (level 8 / 12 / 16 / 20 — level 4 covers the path)
- The hosted PDF download tail (worker → notification → blob); covered by
  `tests/services/CharactersService.test.ts`
