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
- All `<Dialog>` components must include `fullScreen={isMobile}`
- Never use hover-only interactions without a touch-friendly fallback

**Components:**

- Functional components with explicit prop interfaces
- Group related components in folders with `index.ts` exports

**API Layer:**

- RPC client (`client/src/services/rpc.ts`) wraps Hono's `hc` client with `ApiError` class for typed error handling
- `ApiError` includes `status` (HTTP code) and `errorName` (server error class name)
- Use `InferRequestType` / `InferResponseType` from `hono/client` for all API types — never recreate manually

**State Management:**

- **Server state**: TanStack React Query for all API data
- **Auth state**: Zustand store (`stores/authStore.ts`) with localStorage persistence
- **Form state**: React Hook Form — use `form.reset()` to populate edit forms, never `key={}` remounting or `defaultValue={}`

**Hooks & Patterns:**

- `useDebouncedValue(value, delay?)` — shared hook for debouncing search inputs (default 300ms)
- `useRulesetSection` — generic CRUD hook for ruleset detail sections (queries, mutations, dialogs, forms)
- `usePrefetch` — returns `{ onMouseEnter, onFocus }` props for prefetching on hover/focus
- Mutations use `.mutate()` with `onSuccess`/`onError` callbacks, not `.mutateAsync()`

**Toast/Snackbar:**

- Queue-based `SnackbarProvider` in `contexts/ToastContext.tsx` — notifications process sequentially
- Use `useSnackbar()` hook: `snackbar.success()`, `snackbar.error()`, etc.
- Never use `console.error` for user-facing errors — always use snackbar

**Loading Indicators:**

- Always use `<DiceSpinner>` (`components/common/DiceSpinner.tsx`) — never MUI `CircularProgress`
- For Buttons, use the wrapper API so the button doesn't shrink when loading flips: `<DiceSpinner size="small" loading={isPending}>Save</DiceSpinner>` as the Button child. Pair with `disabled={isPending}`. Keep any static `startIcon` outside the wrapper.
- For Suspense fallbacks and full-section loaders, use standalone `<DiceSpinner />` (default medium)

**Dialog Conventions:**

- Pick the wrapper by purpose — there is no lint rule to choose between them, only a convention:
  - **`CreateDialog` / `EditDialog`** (from `StandardDialogs.tsx`): standard create / edit shapes. Default for create or update flows.
  - **`FormDialog`**: any other dialog that contains a React Hook Form. Binds the form, registers with the global dirty-tracker, blocks backdrop / Escape close while dirty.
  - **`Modal`**: confirm dialogs, info dialogs, manager dialogs that don't bind a form. **Never wrap a `<form>` in `Modal`** — Modal skips the dirty-close guard, so backdrop click / Escape discards typed input.
- Manager dialogs with both a list and an invite form: keep the outer `Modal` for the manager and put the form in a nested `FormDialog` opened from an Invite button.
- Edit dialogs receive a `form` prop (from React Hook Form) — parent calls `form.reset({ ...data })` before opening
- Dialog components should not receive the selected entity as a prop — form state is the source of truth
- Form-bearing dialogs must block backdrop click and Escape when `form.formState.isDirty` so users don't lose work. `CreateDialog`/`EditDialog` from `components/common/StandardDialogs.tsx` handle this — prefer them. For custom dialogs, replicate: `onClose={(_, reason) => { if ((reason === "backdropClick" || reason === "escapeKeyDown") && form.formState.isDirty) return; onClose(); }}`

## Git

- Never commit or push without explicitly being asked to
- Always ask before committing and before pushing — these are separate confirmations

## Testing

**Guidelines:**

- Never skip failing tests or use mocks
- Use seed data from test database
- Run with `bun run test`

**Test Structure:**

- Unit/integration tests: `/tests/routers`, `/tests/services`
- E2E tests: `/tests/e2e`
- Each test runs in isolated transaction (auto-rollback)

**E2E directory → Playwright project mapping:**

The directory a new e2e file lives in determines which `project` it runs under, which controls auth state. Get this wrong and the file either won't be picked up or starts with the wrong session.

- `journeys/` → `journeys` project. No prepared auth state — each test signs in itself. **Default home for any test that does its own sign-in**, whether multi-user (invite flows, contributor flows, share with anonymous viewer) or single-user single-area (ruleset fork/archive/publish, character archive/rename, campaign CRUD).
- `auth/`, `navigation/unauthenticated-redirect.e2e.ts` → `guest` project. No auth. Use for sign-in / sign-up / forgot-password / pre-auth redirects.
- `profile/`, `session/`, `navigation/protected-routes.e2e.ts` → `authenticated` project. Loads the prepared `testuser1` storageState from `tests/fixtures/.auth/user.json`. Use only when the test specifically wants the prepared session (no fresh sign-in).

Decision rule: if your test signs in fresh (its own `signIn(page, ...)` call), put it under `journeys/`. If it relies on the prepared `testuser1` storageState being preloaded, put it under `profile/` / `session/` / `navigation/protected-routes`. Avoid mixing — don't override storageState in an `authenticated` file when you can just live in `journeys/`.

For tests under `authenticated/` that nevertheless need to mutate the user (e.g. `profile-edit`'s email/password change tests), keep them in a separate `describe` block with `test.use({ storageState: { cookies: [], origins: [] } })` and use a different seed user (testuser3) so other tests aren't broken by leaked DB state.

Adding a brand-new directory? Update the regex in `playwright.config.ts` (the `testMatch` for the relevant project) — otherwise the files won't run.

**Selector gotchas captured by existing tests:**

- `<Typography component="h3">` renders as `<h3>` and is matched by `getByRole('heading')`; Typography styled only via `sx={{ typography: { xs: "h4" } }}` renders as `<p>` — use text-based selectors there.
- `[role="dialog"]` matches the Featurebase chat iframes too. Scope to the actual MUI dialog with `[role="dialog"][aria-modal="true"]` or by accessible name: `page.getByRole('dialog', { name: 'Fork Ruleset' })`.
- `<ListItemText primary="Fork" secondary="Create your own editable copy" />` produces an accessible name combining both lines. Use `name: /^Fork\b/`, not `name: /^Fork$/`.
- Filter and sort options live inside popup `<Menu>` components; click the "Filter"/"Sort" tooltip IconButton first, then the `MenuItem`.
- Default submit-button labels diverge per dialog wrapper: `CreateDialog` → "Create", `EditDialog` → "Update", `DeleteDialog` → "Delete", custom dialogs (Fork Ruleset / Archive Campaign / Save Changes) override these. Check the actual component before writing the assertion.

**Shared helpers:**

`tests/e2e/helpers.ts` exports `signIn`, `selectOption`, `createCharacter`, and `TEST_USERS` — reuse them across batches instead of inlining. The helpers scope dialog interactions to `[role="dialog"][aria-modal="true"]` to dodge the Featurebase iframe issue.

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
