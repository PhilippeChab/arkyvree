# Development Guidelines

> See [README.md](./README.md) for tech stack, project structure, and setup instructions.

## Code Conventions

- Be DRY
- Reuse existing patterns, naming

**TypeScript & Naming:**

- Strict typing enabled
- PascalCase for components/classes, camelCase for functions, 'use' prefix for hooks
- Use `@/` path alias for cross-directory imports
- Make sure typescript passes before finishing a task - use tsgo
- Always use Hono's Infer types instead of recreating types in the frontend
- Do not use any

## Backend Architecture

The codebase follows a **3-layer architecture** (Routers → Services → Repositories):

1. **Routes** (`/server/routers`): Hono endpoints that call service methods
2. **Services** (`/server/services`): Business logic, transaction management, error handling
3. **Repositories** (`/server/repositories`): SQL queries (Drizzle ORM), accept `db: Db` parameter

**Key Patterns:**

- Services use `withTransaction()` for **all mutations** (create, update, delete) to ensure atomicity
- Repositories accept `db` via dependency injection
- Schema is defined in `/drizzle/schema.ts`
- Routes use `zValidator` from `@/server/middlewares/index.ts` so validation failures use the standard API error envelope and preserve Hono response inference.
- A response never carries a user's `passwordDigest`. Auth responses return the user through `toSafeUser` (`AuthenticationService`), and a query that joins users selects their public columns (`id`, `username`, `emailAddress`), never the whole row.
- `deletedAt IS NOT NULL` means **archived**. The codebase has two row-removal primitives — `repo.archive()` (soft) and `repo.delete()` (hard). Which one to use depends on the table. See [docs/persistence.md](./docs/persistence.md) for the full policy and decision rule. Quick rule: first-class user-facing entities archive by default; junctions, character-state, and customization rows always hard-delete.

**Service Conventions:**

- Session parameter is always named `session: Session`, never `s`
- Use **individual parameters**, not payload/options objects: `linkCharacter(userId, campaignId, characterId, visibility)` not `linkCharacter(payload)`
- Use **shared repository instances** from `@/server/repositories/index.ts`, never instantiate private copies
- Paginated service methods follow: `method(id, where: { search?, orderBy?, orderDir? }, pagination: { limit, page })`

**Permission Checks (Policy vs. Identity):**

Permission gates that determine whether a session is *allowed* to perform an action belong in a Policy class under `server/services/policies/` — `CampaignsPolicy`, `CharactersPolicy`, `RulesetsPolicy`, etc. Each exposes `canRead`/`canUpdate`/`canDelete` plus action-specific methods (`canManageContributors`, `canPublish`, …). Policies throw `ForbiddenError` / `UnprocessableEntityError`; services call them and let the throw propagate.

Inline `<x>.userId === session.userId` comparisons are only acceptable when they're **identity matches**, not permission gates:

- "Is this invite addressed to me?" — `invite.userId !== session.userId` in `acceptCampaignInvite` / `acceptContributorInvite`
- "Did I just oauth-link this account to myself?" — `existing.userId === session.userId`
- "Am I removing my own player slot?" — `isSelfRemoval = player.userId === session.userId` (a branching predicate, not a gate)
- Boolean predicates returned by registration helpers — `Attachable.isOwner = (s, id) => character?.userId === s.userId`

Anything that *throws* on the basis of ownership is a permission check and should move into a Policy.

**Repository Conventions:**

- `where` params use **union types** for type safety, not all-optional objects: `where: { id: string } | { userId: string; campaignId: string }`
- Use `this.where([...])` with `"key" in where && eq(...)` to build conditions from union types
- **Paginated methods** signature: `findMany(db, where: { ...filters, search?, orderBy?, orderDir? }, pagination: { limit: number; page: number })`
- Pagination goes in a **separate `pagination` param**, never mixed into `where`
- Use `this.withPagination(pagination, callback)` for paginated queries. For join queries that return non-model types, use `this.paginate()` / `this.paginated()` directly
- Use `this.search(search, [columns])` for text search — returns `SQL | false`, use `|| undefined` when passing to `and()`
- Use `this.orderBy(column, direction)` for sorting — never hardcode `desc()`/`asc()` directly
- Search sentinel is `false` (not `undefined`) for consistency with `this.where()` filtering

## Frontend Architecture

**Mobile First:**

- Develop mobile first — all new components and layouts must work on small screens (375px) before scaling up
- Use `useIsMobile()` hook (`client/src/hooks/useIsMobile.ts`) for mobile-specific branching
- Use MUI responsive sx props (`{ xs: ..., sm: ..., md: ... }`) over static values
- All `<Dialog>` components must include `fullScreen={isMobile}`. A full-screen dialog has no backdrop to tap, so every dialog needs its own way out: a Close or Cancel button
- Never use hover-only interactions without a touch-friendly fallback. A table's row actions spread `ROW_ACTIONS_HOVER_SX` into the row's `sx` and `ROW_ACTIONS_SX` into their box (`className="row-actions"`): revealed on hover with a pointer, always shown on touch screens and while focused

**Components:**

- Functional components with explicit prop interfaces
- Every control has an accessible name. An icon-only `IconButton` takes an `aria-label` (a `Tooltip` around it names it, but not when the tooltip wraps a `<span>` for a disabled button). A `Tooltip` on an element that already has text (a chip, a list option, a labelled button) takes `describeChild`, otherwise its title replaces the element's name. A switch or checkbox is the `control` of a `FormControlLabel`, and a dialog without a `DialogTitle` points `aria-labelledby` at its heading
- Everything a click opens is reachable from the keyboard. A row or card that opens or expands on click spreads `clickableProps(onActivate)` and puts `CLICKABLE_SX` in its `sx` (`components/common`): focusable, activated with Enter or Space, with a focus ring. A control inside it stops its click from reaching the row
- Group related components in folders with `index.ts` exports. Code outside a folder imports it through its `index.ts`, never a file inside it; files within the folder (its subfolders included) import each other directly, and a subfolder with its own `index.ts` is imported through that
- An `index.ts` exports what code outside its folder uses. An entry, or a whole `index.ts`, that nothing imports is dead code: delete it. Page folders have none: routes import each page file directly (most lazily, so each gets its own chunk)

**API Layer:**

- RPC client (`client/src/services/rpc.ts`) wraps Hono's `hc` client with `ApiError` class for typed error handling
- `ApiError` includes `status` (HTTP code) and `errorName` (server error class name)
- The RPC fetch throws `ApiError` on every non-2xx response, so never check `response.ok`. Read bodies with `parseResponse(rpc.api.x.$get(...))` (re-exported from `rpc.ts`), which also narrows to the success type. To react to a specific status (e.g. show "not found"), catch `ApiError` and test `error.status`
- Use `InferRequestType` / `InferResponseType` from `hono/client` for all API types — never recreate manually
- Queries shared between a page and a prefetch (sidebar hover, card hover) live in `client/src/lib/queries.ts` as `queryOptions` factories, so the key, page size and params can't drift apart. Ruleset and campaign tab lists do the same in `pages/rulesets/details/sectionQueries.ts` and `pages/campaigns/details/sectionQueries.ts`, and so do the detail pages that a table row prefetches on hover: the customization page's entity in `pages/rulesets/customization/entityQueries.ts`, the simple entity pages (abilities, skills, saves…) in `pages/rulesets/details/entities/entityDetailQueries.ts`, and the class page and its tabs in `pages/rulesets/details/classes/classSectionQueries.ts`. A page renders with its factory and the hover prefetch (ruleset tab, campaign card, table row) goes through it. Every query key comes from `lib/queryKeys.ts`

**State Management:**

- **Server state**: TanStack React Query for all API data
- **Auth state**: Zustand store (`stores/authStore.ts`) with localStorage persistence
- **Form state**: React Hook Form — use `form.reset()` to populate edit forms, never `key={}` remounting or `defaultValue={}`. Map a nullable text column to `""` in the form values (`description: x.description ?? ""`): an input holds `""`, so `undefined` makes the form dirty on mount. A custom input bound through `Controller` passes `field.ref` to the input element (`inputRef`), so a failed submit can focus it

**Hooks & Patterns:**

- `useDebouncedValue(value, delay?)` — shared hook for debouncing search inputs (default 300ms); a cleared value applies at once, so resetting a search never filters by the old text
- `useRulesetSection` — generic CRUD hook for ruleset detail sections (queries, mutations, dialogs, forms); spread its `createDialogProps` into the section's `CreateDialog`
- `useRulesetPermissions(ruleset)` — the single source of ruleset edit / manage / publish rights on the client
- `useFormSync(form, values, { key, updatedAt })` — keeps an inline edit form in step with server data without wiping unsaved edits on refetch; use it instead of an effect that calls `form.reset()` whenever the query data changes. `key` is the record from the URL (include the ruleset id for ruleset entities: inherited ones keep their id in every fork), so opening another record resets the form. A page that follows a copy-on-write to the copy passes the source's key as `adoptKey`: a form still holding the source takes the new key over and keeps its unsaved edits. Submit through `sync.handleSubmit`, send `sync.updatedAt()` as the save's stale-edit token, and on success call `sync.saved(values, response.updatedAt)` instead of `form.reset()`
- `useListParams(sortFields, defaultSort)` — a list page's search and sort from the URL, plus the `searchBarProps` that change them (`SearchBar` already debounces typing: don't debounce `search` again). `useSearchParam` for any other filter; `oneOf()` (`lib/oneOf.ts`) validates enum params. Sort options come from `NAME_SORTS` / `CREATED_SORTS` / `UPDATED_SORTS`
- `useNotificationActions` — accept / reject invites, download exports and open targets for any notification surface
- `useRulesetAbilities(rulesetId)` / `useRulesetSaves(rulesetId)` / `useRulesetLanguages(rulesetId)` — the ability / save / language lists for pickers and columns (the first 100 of each, the most one request returns; rulesets have far fewer); don't query them ad hoc. `useRulesetFeats(rulesetId, search)` is the feat picker's list: a ruleset has hundreds, so it searches the server and pages in as the listbox scrolls
- `useOpenEntity(rulesetId)` — opens a ruleset entity's page with the current list as its Back target; `entityPageState(location.state)` reads that target back
- `useValidationIssues()` — a save the server can refuse with rules warnings: shows them in the form (with a force save), toasts anything else
- `useToggleSet()` — expanded rows / open groups, toggled one key at a time
- `usePrefetch` — returns `{ onMouseEnter, onFocus }` props for prefetching on hover/focus
- Infinite listboxes: `useListboxQuery(options)` returns the loaded `items` and the listbox's `onScroll`; give the listbox `ScrollSafeListbox`. Several queries behind one listbox share a `createListboxScrollHandler([...])` (`lib/listboxScroll.ts`); flatten any other infinite query with `pageItems(data)` (`lib/pageItems.ts`)
- A query that can't run yet passes `skipToken` as its `queryFn` (not `enabled` plus a guard or `!` in the `queryFn`); `enabled` is for plain on/off gates
- Untyped JSON (activity and notification payloads, stored state) is read through `isRecord` (`shared/isRecord.ts`) guards, not casts
- Mutations use `.mutate()` with `onSuccess`/`onError` callbacks, not `.mutateAsync()`

**Shared UI building blocks** (`components/common`): `PageHeader` (top of every list / account page), `ListCard` + `ListCardGrid` + `InfoPill` (ruleset, character and campaign grids), `DetailPageHeader` + `SectionTabs` (ruleset / campaign pages), `PageActionButton` (the create action in a list page header and empty state), `LoadMoreButton` (paginated lists), `BlankState` (empty lists; pass the icon component, it applies the standard size and tint), `SectionContent` (a tab's centered column), `PageError` (a page that failed to load, with its way back; `loadFailureMessage(what, error)` from `lib/errorMessage.ts` gives its text. Show it only when there's no data (`if (!data)`), so a failed background refetch doesn't replace a loaded page. Pages showing a record others control (campaign, campaign character, shared sheet) also show it on `accessLost(error)`: a 404 / 403 means it was deleted or access was revoked), `ActionMenuItem` (a page's action menu item, colored by intent), `NameField` / `DescriptionField` / `EmailField` / `PasswordField` (with `nameRules` from `lib/validation.ts`; a number field validated by the form takes `wholeNumberRules(min, required?)` from there instead of a native `min`, which would block the submit before the field shows why), `SelectField` (a form's select), `RulesetPicker` + `BaseRulesetAlert` (a create dialog's ruleset), `ValidationIssueList`. A select outside a form is a `TextField select`: `FormControl` + `InputLabel` + `Select` leaves the combobox without an accessible name. Ruleset tables use `DescriptionCell` and `AptitudeChipsCell`, and spell lists `SpellLevelFilter` (`pages/rulesets/components`). Formatting helpers live in `lib/formatNumeric.ts` (`formatSigned`, `formatCount`, `formatCost`, `formatWeight`) and `lib/errorMessage.ts`; an empty value reads "—". Reuse them rather than restyling a copy.

**Toast/Snackbar:**

- Queue-based `SnackbarProvider` in `contexts/ToastContext.tsx` — notifications process sequentially
- Use `useSnackbar()` hook: `snackbar.success()`, `snackbar.error()`, etc.
- Never use `console.error` for user-facing errors — always use snackbar

**Loading Indicators:**

- Always use `<DiceSpinner>` (`components/common/DiceSpinner.tsx`) — never MUI `CircularProgress`
- For Buttons, use the wrapper API so the button doesn't shrink when loading flips: `<DiceSpinner size="small" loading={isPending}>Save</DiceSpinner>` as the Button child. Pair with `disabled={isPending}`. Keep any static `startIcon` outside the wrapper.
- For Suspense fallbacks and full-section loaders, use standalone `<DiceSpinner />` (default medium); it centers itself, so give it the block's spacing through `sx` (`<DiceSpinner sx={{ py: 4 }} />`) instead of wrapping it in a Box

**Dialog Conventions:**

- Pick the wrapper by purpose — there is no lint rule to choose between them, only a convention:
  - **`CreateDialog` / `EditDialog`** (from `StandardDialogs.tsx`): standard create / edit shapes. Default for create or update flows.
  - **`FormDialog`**: any other dialog that contains a React Hook Form. Binds the form, registers with the global dirty-tracker, blocks backdrop / Escape close while dirty.
  - **`ConfirmDialog` / `DeleteDialog`** (from `StandardDialogs.tsx`): yes/no confirmations. Set `confirmColor` by intent (`warning` for Archive / Leave, `success` for Publish, `error` for destructive) and `confirmLabel` to the action ("Archive Character", not "Confirm"). `DeleteDialog` is the `error` preset.
  - **`Modal`**: info dialogs and manager dialogs that don't bind a form. **Never wrap a `<form>` in `Modal`** — Modal skips the dirty-close guard, so backdrop click / Escape discards typed input.
- Dialog title and action-bar styling come from the theme — use a plain `<DialogTitle>` and `<DialogActions>` without extra typography or padding.
- Manager dialogs with both a list and an invite form: keep the outer `Modal` for the manager and put the form in a nested `FormDialog` opened from an Invite button.
- Edit dialogs receive a `form` prop (from React Hook Form) — parent calls `form.reset({ ...data })` before opening
- Dialog components should not receive the selected entity as a prop — form state is the source of truth
- Form-bearing dialogs must block backdrop click and Escape when `form.formState.isDirty` so users don't lose work. `CreateDialog`/`EditDialog` from `components/common/StandardDialogs.tsx` handle this — prefer them. For custom dialogs, replicate: `onClose={(_, reason) => { if ((reason === "backdropClick" || reason === "escapeKeyDown") && form.formState.isDirty) return; onClose(); }}`

## Git

- Never commit image files. Screenshots may be attached directly to pull requests.
- Never commit or push without explicitly being asked to
- Always ask before committing and before pushing — these are separate confirmations

## Testing

**Guidelines:**

- Never skip failing tests or use mocks
- Use seed data from test database
- Run with `bun run test`, or `bun run test:changed` for the files changed from the parent branch
- E2E (`bun run test:e2e`) builds the client and serves it with the API from one server, as in production, on a copy of the seeded test database (`<name>_e2e`, refreshed by `bun run test:db:reset`). It runs on half the CPU cores locally; pass `--workers N` to change it for one run. `E2E_SKIP_BUILD=1` reuses the last build; `E2E_COVERAGE=1` reports the client code the journeys run (coverage/e2e)
- E2E setup goes through the API (`signIn`, `forkCoreRuleset`, `createCharacter`, `createCampaign`, or `apiOf(page)` from `tests/e2e/api.ts`): a journey clicks through only what it tests. Select by role and accessible name, never by `data-testid` (the production build strips MUI's). Every e2e file imports `test` / `expect` from `tests/e2e/fixtures.ts`

**Test Structure:**

- Backend tests: `/tests/routers` (the API, through `tests/api.ts`), `/tests/services`, `/tests/rulesets` (character computation, target paths, requirements), `/tests/cache`, `/tests/seeds` (the seeders, the seeded content, the package runner and the test data), `/tests/parser` (the parser tools; the scraper's parsers read the trimmed pages in `tests/parser/fixtures`), `/tests/jobs`
- Client tests: `/tests/client` (the client's logic that needs no browser: `lib/`)
- E2E tests: `/tests/e2e`
- Each test runs in its own transaction, rolled back afterwards (`tests/setup.ts`); a transaction the code opens in it (`withTransaction`, `db.transaction`) is a savepoint on the same connection, rolled back when it throws. In production that transaction is its own, on another connection, so tests don't catch transaction-boundary bugs (what it can see, when it commits). It has a single connection: run service calls that write one at a time, never in a `Promise.all`: concurrent savepoints share a name, so one's failure silently undoes the other's writes
- The ruleset cache outlives the rollback. Write a test's rows into a fork (`createSeededTestRuleset`), not a seeded ruleset; a test that has to write into a seeded one calls `invalidateSeededRuleset(rulesetId)` afterwards, and the setup drops those rules again once the rollback undoes the rows
- CRUD, ownership and copy-on-write of every ruleset entity are tested once, for all of them, in `tests/services/rulesets/EntityServices.test.ts`: an entity's own service test covers only what's particular to it

**E2E directory → Playwright project mapping:**

The directory a new e2e file lives in determines which `project` it runs under. Get this wrong and the file won't be picked up.

- `journeys/` → `journeys` project: every signed-in test. Each signs in itself through the API (`signIn`), as users of its own from `tests/e2e/fixtures.ts`: the worker's `ownerUser` / `inviteeUser` for tests that build their own content, and the test's own `user` for one that changes the user itself (email, password, session), so no test depends on another's order or leftovers.
- `auth/`, `navigation/unauthenticated-redirect.e2e.ts` → `guest` project: signed out. Sign-in / sign-up / forgot-password / pre-auth redirects.

Adding a brand-new directory? Update the regex in `playwright.config.ts` (the `testMatch` for the relevant project) — otherwise the files won't run.

**Selector gotchas captured by existing tests:**

- `<Typography component="h3">` renders as `<h3>` and is matched by `getByRole('heading')`; Typography styled only via `sx={{ typography: { xs: "h4" } }}` renders as `<p>` — use text-based selectors there.
- Scope dialog selectors to the open MUI dialog with `[role="dialog"][aria-modal="true"]` or by accessible name: `page.getByRole('dialog', { name: 'Fork Ruleset' })`.
- `<ListItemText primary="Fork" secondary="Create your own editable copy" />` produces an accessible name combining both lines. Use `name: /^Fork\b/`, not `name: /^Fork$/`.
- Filter and sort options live inside popup `<Menu>` components; click the "Filter"/"Sort" tooltip IconButton first, then the `MenuItem`.
- Default submit-button labels diverge per dialog wrapper: `CreateDialog` → "Create", `EditDialog` → "Update", `DeleteDialog` → "Delete", custom dialogs (Fork Ruleset / Archive Campaign / Save Changes) override these. Check the actual component before writing the assertion.

**Shared helpers** — reuse them instead of inlining:

- `tests/helpers.ts`: users, sessions, rulesets (seeded forks), campaigns, characters, levels and contributors written straight to the database; `getSeedCtx()` for the seeded ids; `invalidateSeededRuleset`
- `tests/api.ts`: the typed API client as the seed user (`api`), a guest (`guestApi`) or a new user (`createSignedInUser`), and `expectOk`
- `tests/levelFixtures.ts`: seeded character builds, level plans and level-ups, and masters with their bonded creature
- `tests/seeds/seededRows.ts`: a seeded ruleset's own rows, for the seed tests; `tests/seeds/freshSeed.ts`: a new system ruleset (or extension) for a seeder test to seed into, and what an entity was seeded with; `tests/storage.ts`: the fake storage backend
- `tests/e2e/helpers.ts`: signing in (`signIn`, `signedInPage`), `createCharacter`, `createCampaign`, `forkCoreRuleset` (all through the API), invites (`invitePlayer`, `inviteContributor`, `answerInvite`), `openActionsMenu`, `filterList`, `apiResponse` waits. They scope dialog interactions to `[role="dialog"][aria-modal="true"]`. `tests/e2e/levelUpHelpers.ts` walks the Add Level wizard; the seeded users' credentials are `TEST_USERS` in `tests/fixtures/auth.fixture.ts`
- [docs/e2e-coverage.md](./docs/e2e-coverage.md) indexes what each e2e file covers: update it with the suite

## Application Logic

- See [docs/target-paths.md](./docs/target-paths.md) and [docs/customization.md](./docs/customization.md) for the customization system (modifiers, requirements, properties)
- See [docs/rulesets.md](./docs/rulesets.md) for the ruleset system: COW, extensions, forking, publishing, authorization, universal vs ruleset-specific code boundaries, and how to add a new ruleset
- See [docs/packages.md](./docs/packages.md) for adding content packages: structure, versioning, seed helpers, and rules
- See [docs/caching.md](./docs/caching.md) for the caching system: ruleset raw-tier cache, request-scoped query dedup, compose step, invalidation
- See [docs/deployment.md](./docs/deployment.md) for the Fly.io deployment: two-app topology, worker wake-up via Flycast, CI/CD, env vars, domain setup, and debugging
- See [docs/persistence.md](./docs/persistence.md) for the soft-archive vs hard-delete policy and decision rule
- See [docs/auth-routing.md](./docs/auth-routing.md) for the auth/routing architecture: three-bucket layout-route tree, cookie security, demo lifecycle (entry-to-auth vs in-app TTL expiry), stale-cookie defense, cross-tab behavior
- See [docs/access.md](./docs/access.md) for the policy matrix (rulesets / characters / campaigns / customizations), actor definitions (owner / contributor / campaign member), and the ruleset listing-scope reference
- See [docs/ui-buttons.md](./docs/ui-buttons.md) for action button color / variant conventions across Buttons and MenuItems (destructive / caution / positive / cancel)
- [help/](./help/README.md) is the user-facing help center and [CHANGELOG.md](./CHANGELOG.md) the user-facing changelog, both linked from the app. Update them when a change alters user-visible behavior
