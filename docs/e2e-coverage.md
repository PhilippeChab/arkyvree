# E2E Coverage

## Patterns

**Selectors.** A chip's delete icon is `.MuiChip-deleteIcon`.

**Multi-tab / multi-user flows.** Invite, share and contributor tests open
a second browser context for the other participant (`signedInPage`, or `openContext` for a guest) —
never a separate Page in the same context (cookies would leak). The demo's
cross-tab test is the exception: its two tabs share a context on purpose.

**API-response gates.** Tests that depend on async server work
(`fillNewCharacter` waits for `/creation/race`; `answerInvite` waits for
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
