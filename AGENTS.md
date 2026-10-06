# Development Guidelines

> See [README.md](./README.md) for tech stack, project structure, and setup instructions.

## Code Conventions

- Be DRY
- Reuse existing patterns, naming
- A function in the server or `shared/` holds at most 80 of its own lines (`arkyvree/function-length`; blank and comment lines aside, a nested function's body counts in it, not in the function around it): a longer one splits into named steps, helpers above it, never a disable comment. `bun run lint` fails on any disable comment that no longer disables anything
- No comment turns a lint rule off (`arkyvree/no-disable-comments`): a case a rule gets wrong changes the rule, its options or its definition, never one line. TypeScript's errors are fixed, never silenced: no `@ts-expect-error`, `@ts-ignore` or `@ts-nocheck` (`typescript/ban-ts-comment`). An oxlint comment could turn those two off as well, so `tests/lint/disableComments.test.ts` reads every tracked file's comments outside oxlint
- A comment is written one way (`arkyvree/comment-style`; `bun run lint --fix` writes what it can). What describes a declaration is one `/** … */` right above it, and a file may open with one describing the file, a blank line under it (on an import, sorting the imports would move it). In code, a comment is `//`, right above or at the end of what it explains. Nothing stands apart: no heading or banner (`// ── X ──`, a title between `// -----` lines: a section of its own is a module of its own), no comment with a blank line between it and what it describes, no `/* … */`. A comment a tool reads keeps the tool's syntax (`// oxfmt-ignore`, a disable comment, `/*#__PURE__*/`), and so does a JSX comment (`{/* … */}`)
- A file's own function is a `function` declaration with typed parameters (`function verbOf(method: string) {…}`, `export async function sendEmailTask(payload: unknown, helpers: JobHelpers)`), never a variable holding an arrow: an arrow is for a callback (`arkyvree/function-declarations`; `bun run lint --fix` declares one)
- A file reads bottom-up: a helper sits above the code that uses it, in a file's sections too (oxlint's `no-use-before-define`). It reads in one order: its imports, its types, its constants, its helpers (the functions it keeps to itself), then what it's for (its exports, its class, a test file's `describe` blocks), then its run. Within its types, and within its constants, the file's own come first, then the ones it exports. A constant is a value: it never uses the file's own functions or classes (a factory lives in a module of its own, which its values import), and one the file keeps never reads one the file exports. A call, a condition or a loop at a file's top is a step of its run, which only a script has: a module (a file that exports) has none, a script that imports it runs it. Nothing is declared after a step, so its steps go below its declarations, or into a function it calls last (a script's `main()`; a test file's setup, a `beforeAll`). `--fix` never changes the order code runs in: a file with a declaration after a step, or whose order would swap two declarations that run code (a call, `new`, `await`, a class's `extends`, an `export default` value), is reported and moved by hand. A test file's helper never sits in a `describe` (`arkyvree/file-layout`; `bun run lint --fix` orders a file)
- `shared/` holds what more than one of the client, the server and the database packages use, grouped by domain (`customization/`, `dnd3.5/`): types, vocabulary and pure helpers, never code tied to one runtime (Bun's APIs, the database; `arkyvree/shared-runtime` refuses `bun` and `node:` imports). It never imports `drizzle/schema.ts` at runtime, which would load the whole schema in the client: a database enum's options are written out in `shared/enums.ts`, checked against the schema and the database by `tests/shared/enums.test.ts`. Take the enum types (`ItemLocation`, `ContributorRole`, …) and the customizable entity types (`shared/customization/entities.ts`) from there rather than re-deriving them
- Every class and every file's functions keep one member order: sync before async, then the lifecycle (`load`, `preload`, `init` / `initialize`, `build`, `apply`, in that order, so a class that sets itself up reads top-down), reads, creates, updates, deletes, then the other actions, by name within each group (`arkyvree/member-order`, `lint/memberOrder.mjs`; `bun run lint --fix` sorts a file). A file sorts its helpers, then its exports, in each run of functions, and a function another one calls stays above it: a file's functions never call each other (the rule reports a cycle: untangle it). A method's group is its leading verb: `find` / `get` / `exists` / `count` / `is` read, `create` / `add` / `duplicate` create, `update` / `set` / `mark` update, `delete` / `archive` / `unarchive` delete. A class keeps its constructor, statics and fields at the top, in their own order (a field's initializer may read an earlier one), then its private and protected methods, then its public ones, each in that order (an async method's overload signatures go with it). A router's routes sort by HTTP method, then by path, a fixed segment before a parameter (Hono matches overlapping routes in registration order); a router mounts its sub-routers (`.route()`) first, in their own order, then its routes, which must not overlap theirs (Hono would run the sub-router's first: `tests/routers/application.test.ts` checks every route answers its own requests), and a `.use()` ends the run it sorts, since middleware applies to what follows it. The rule is an oxlint JS plugin, in alpha, so oxlint's version is pinned
- `oxfmt` formats the code (`bun run format`; CI runs `format:check`): 120 columns, the imports sorted and grouped. What tools write keeps their layout: the drizzle schema and relations (`drizzle-kit pull`) and the parser's `generated/`. A data table keeps one row per line under `// oxfmt-ignore`. oxlint's `sort-imports` sorts the names inside an import

**TypeScript & Naming:**

- Strict typing enabled
- PascalCase for components/classes, camelCase for functions, 'use' prefix for hooks
- Use `@/` path alias for cross-directory imports, never `../` (`arkyvree/no-parent-imports`: `bun run lint --fix` rewrites one)
- The server reads its environment through `server/environment.ts`, which lists every variable it reads and what for: `readEnv("APP_URL")`, `isProduction()`, `isTest()`, `isDevelopment()` (`NODE_ENV=development` explicitly: it unmasks errors, so it's never assumed; "not production" is `!isProduction()`). Never `process.env` or `Bun.env` elsewhere in the server or `shared/` (`arkyvree/environment`); a default stays with the code that reads the variable
- Make sure typescript passes before finishing a task - use tsgo
- Always use Hono's Infer types instead of recreating types in the frontend
- Do not use `any` (`typescript/no-explicit-any`): an untyped value is `unknown`, narrowed by checks (`isRecord`, the engine's `isTraversable`). A rest parameter may be `any[]`, which TypeScript requires of a mixin's constructor (TS2545, `server/mixins.ts`); the engine's holders are `object`s, their getters read by name through `readHolder`

## Backend Architecture

The codebase follows a **3-layer architecture** (Routers → Services → Repositories):

1. **Routes** (`/server/routers`): Hono endpoints that call service methods
2. **Services** (`/server/services`): Business logic, transaction management, error handling
3. **Repositories** (`/server/repositories`): SQL queries (Drizzle ORM), accept `db: Db` parameter

Lint holds the layers (`lint/architecture.mjs`) and the method and function names (`lint/methodNames.mjs`):

- **`arkyvree/layers`**: a layer imports only what's below it, from `server/database/` up through `server/repositories/`, then `server/cache/`, copy-on-write's writes (`server/cow/`) and the engine (`server/rulesets/`), then `server/services/`, `server/jobs/` and `server/routers/`. `server/middlewares/` sits on the repositories, beside the services. Copy-on-write's read side, the view a ruleset's reads see (`withRulesetScope`, the override map), is the cache's (`cache/rulesetCache/`); its write side, the copy a change to an inherited entity makes (`cowEntity`…), sits above it. The server reads the content packages' data (`database/packages/`), never the seeders or scripts. `shared/` imports nothing app-specific (the schema's types only), and the client takes only types from the server
- **`arkyvree/queries-in-repositories`**: a query (`db.select`, `tx.update`, `db.query.…`, `unionAll`) is built in `server/repositories/` or `server/database/` (what talks to Postgres itself: the job queue's `addJob`, `notifyChannel`, `pingDatabase`), nowhere else in the server. A transaction's handle is named `tx` (`withTransaction(async (tx) => …)`), the name the rule knows a query by
- **`arkyvree/folder-index`**: code outside a folder that has an `index.ts` imports it through that index: every server folder that has one (the services', `cow/`, `policies/`, the repositories', the database's, the cache's, the engine's, the emails'…), but the routers' (a route folder's `index.ts` is its routes), and the client's component folders. Files within the folder import each other directly; a test may reach a folder's own modules, and so may the seeders and the parser's tools, which read the engine's pure modules without loading the database an index would
- **`arkyvree/method-names`**: a public method starts with a verb its layer knows. A repository reads with `find`, `exists` or `count`, writes with `create`, `update`, `upsert`, `delete`, `archive`, `unarchive`, `mark`, `backfill`, `orphan` or `publish`, and locks with `lock`: `server/repositories/methodVerbs.json`, which the request cache classifies its methods by (a read is memoized within the request and sees copy-on-write ids, a write clears the cache). A service reads with `get`, creates with `create`, `add` or `duplicate`, updates with `update`, `set` or `mark`, deletes with `delete`, `remove`, `archive`, `unarchive` or `hardDelete`, or takes one of the actions `lint/methodNames.mjs` lists (`fork`, `publish`, `invite`, `accept`…), on its own resource: `FeatsService.getFeat` / `getFeats` / `createFeat`, `CampaignPlayersService.addPlayer`, a class is `Class` (`ClassesService.getClass`; `Klass` stays in the schema). Never `ById` (the id is a parameter) or `My` (the session's scope is implied). A policy checks with `can` (it throws, or returns what it checked) or `is` (a yes or no), and `for` builds one. A repository method never names a filter (`By`, `For`, `In`, `On`, `From`, `All`): its filters go in its `where`. Private and protected methods name themselves
- **`arkyvree/function-names`**: an exported function of the server or `shared/` (declared, held by a `const`, or listed in an `export { f }`) starts with a verb (`FUNCTION_VERBS` in `lint/methodNames.mjs`: `getPlannedKlassLevels`, `buildSkillContexts`, `compareCompletions`, `cowEntityToEdit`), or is one of the shapes the code writes: a context it runs a callback in (`withTransaction`), a handler it registers (`onShutdown`), a conversion (`toSafeUser`) or a constructor (`newOverrideMap`). A PascalCase one names a type (a concern, a class's factory), and a module's own functions name themselves.

Where code goes, by what it needs:

- A step only one class takes, and small: a `private` method of that class
- Methods that work on a class's state (`this`), split out of a large class or shared among classes of one kind: a concern, a mixin the class includes (`include(Base, A, B)`, `server/mixins.ts`), in a `concerns/` folder by the class. It's named for what it adds, in a file of its name: a verb when it adds behavior (`Archives`, its class `Archiving`), a noun when it adds a part of the model (`ArmorClass`, its class `WithArmorClass`). It adds methods, never state (`arkyvree/concern-shape`)
- A function that needs no `this`, used by several services, jobs or tests: a helper, a module named for what it does (`characters/editableCharacter.ts`), in the folder of the service whose domain it is, exported through its `index.ts`. Never a `helpers` or `utils` grab bag (`arkyvree/no-helpers-modules`)
- A query: a repository method (a query across every entity table: `RulesetEntities`)

**Key Patterns:**

- Every write (create, update, delete) and lock goes through a transaction: a repository write or lock outside the repositories takes its handle, `tx` (`withTransaction(async (tx) => …)`), never the shared `db`, in the services and the jobs alike (`arkyvree/writes-in-transactions`, by `methodVerbs.json`'s write and lock verbs). A transaction's queries run one at a time, on its one connection: await them in turn, never in a `Promise.all` (the rule reports one over `tx`, or over a handle a function is given, which may be a transaction; node-postgres queues them today and pg@9 throws)
- Repositories accept `db` via dependency injection
- Schema is defined in `/drizzle/schema.ts`
- Routes validate with `validate` from `@/server/middlewares/index.ts` so validation failures use the standard API error envelope and preserve Hono response inference (`arkyvree/route-conventions` holds it, camelCase path params, kebab-case fixed segments, a status on every `c.json`, and no `try` in `server/routers/api/`).
- A route's params are a named schema, never written in the route (`validate("param", featParams)`; `arkyvree/route-conventions`): the ones several routers use come from a `validation.ts` (`server/routers/api/validation.ts`: `idParam`, `characterIdParam`, `contributorParams`; the class routes' `classParams` from `rulesets/classes/validation.ts`, the customization routes' `entityParams` and `ownerParams` from `rulesets/customization/validation.ts`), and a router's own are declared at its top, built on those (`const featParams = idParam.extend({ featId: z.string().uuid() })`). Paging comes from `server/routers/api/validation.ts` too (`page`, `limit` / `limitDefaultingTo(n)`). A query list (comma-separated ids, picks) is parsed by its schema's `transform`, not in the handler. Path params are camelCase (`:modifierId`), and fixed segments kebab-case (`/class-levels`, `/spells-known`). A URL says "class" where the code says "klass" (`class` is a reserved word): an entity type in a path or a query is its segment (`getUrlSegment` in `shared/urlSegments.ts`: `class-levels`, `classes`), which a route reads back as the type with `buildEntityTypeSchema`, and a query names a class `classId`. The schema, the services and the JSON bodies keep `klass`
- A route answers with what its service returns: `return c.json(await XService.method(…), status)`. What a route or a service throws reaches the app's `onError` (`server/routers/application.ts`; `wrapNonErrors` makes a thrown value that isn't an `Error` one first), which answers with the error in the API's envelope and its status: a route never catches a service's error to answer it. So a route's types list its successes only, and a test checks an error status with `expectStatus(response, status)` (`tests/support/api.ts`).
- A response never carries a user's `passwordDigest`. Auth responses return the user through `toSafeUser` (`server/services/authentication/accounts.ts`), and a query that joins users selects their public columns (`id`, `username`, `emailAddress`), never the whole row.
- `deletedAt IS NOT NULL` means **archived**. The codebase has two row-removal primitives — `repo.archive()` (soft) and `repo.delete()` (hard). Which one to use depends on the table. See [docs/persistence.md](./docs/persistence.md) for the full policy and decision rule. Quick rule: first-class user-facing entities archive by default; junctions, character-state, and customization rows always hard-delete.

**Service Conventions:**

- Session parameter is always named `session: Session`, never `s` (`_session` when it's unused; `arkyvree/session-param`)
- Use **individual parameters**, not payload/options objects: `linkCharacter(userId, campaignId, characterId, visibility)` not `linkCharacter(payload)`
- Use **shared repository instances** from `@/server/repositories/index.ts`, never instantiate private copies (`arkyvree/repository-instances`). `withRequestCache` (`server/repositories/withRequestCache.ts`) wraps each one there. The repositories sit in folders by domain, like the services' top-level folders (`repositories/rulesets/FeatsRepository.ts`)
- Paginated service methods follow: `method(id, where: { search?, orderBy?, orderDir? }, pagination: { limit, page })`
- A service is a class used through its one shared instance, like a repository: its file exports `new XService()` and nothing else. Routers and tests call its methods on it (`XService.method(…)`), never detached, which would lose `this` (a test that passes one as a value binds it)
- Each service has a folder of its own, laid out like the routers (`rulesets/feats/FeatsService.ts`, `characters/inventory/CharacterInventoryService.ts`). A helper only that service uses is one of its `private` methods, at the top of the class, or a module in its folder when it's large (`inventory/validation.ts`, the level-up steps in `levels/dnd3.5/`). A helper several services use is a module in the folder of the service whose domain it is (`characters/editableCharacter.ts`, `characters/pdf.ts`, `activities/activityNotifications.ts`), named for what it does, never a `helpers.ts`. A folder's `index.ts` exports its service and what code outside the folder uses from it: code outside imports through it, files within the folder (its subfolders included) import each other directly
- A large service splits by concern, the way Ruby includes a module: a concern is a mixin in its folder's `concerns/` (`rulesets/concerns/Publishes.ts`), and the service includes it with `include(Object, Archives, Publishes, Stars)` (`server/mixins.ts`), its concerns by name (`arkyvree/include-order`). A concern adds methods, never state, and builds on the class's base alone; a helper it shares with the class is `protected`, and one several concerns share belongs to the base (`CombatState`) or a module. So does a large character engine class (`DetailedCharacterCombat` includes `combat/`'s `ArmorClass`, `Attacks`, `HitPoints`…). A class with state to split keeps that state in a base its concerns build on (`CombatState`, `SpellcastingState`). So does a policy: `RulesetsPolicy` is `RulesetRoles` (the session's role on the ruleset) plus `policies/concerns/` (`ContributorRights`, `CreationRights`, `EntityRights`, `ExtensionRights`)

**Permission Checks (Policy vs. Identity):**

Permission gates that determine whether a session is _allowed_ to perform an action belong in a Policy class under `server/services/policies/` — `CampaignsPolicy`, `CharactersPolicy`, `RulesetsPolicy`, etc. Each has the checks its services make (`canUpdate`, `canDelete`, `canManageContributors`, `canPublish`, …): a check no service makes doesn't exist. Policies throw `ForbiddenError` / `UnprocessableEntityError`; services call them and let the throw propagate.

A service builds a policy with `await XPolicy.for(db, session, entity)`, never `new`, and its checks are sync (`arkyvree/policy-shape`): see [docs/access.md](./docs/access.md) for what `for` loads and what a check is passed.

Inline `<x>.userId === session.userId` comparisons are only acceptable when they're **identity matches**, not permission gates:

- "Is this invite addressed to me?" — `invite.userId !== session.userId` in the invite services' `acceptInvite`
- "Did I just oauth-link this account to myself?" — `existing.userId === session.userId`
- "Am I removing my own player slot?" — `isSelfRemoval = player.userId === session.userId` (a branching predicate, not a gate)
- Boolean predicates returned by registration helpers — `Attachable.isOwner = (s, id) => character?.userId === s.userId`

Anything that _throws_ on the basis of ownership is a permission check and should move into a Policy.

**Repository Conventions:**

- `where` params use **union types** for type safety, not all-optional objects: `where: { id: string } | { userId: string; campaignId: string }`
- One method per verb: a repository's `findOne`, `findMany`, `findPage`, `exists`, `count`, `create`, `update`, `delete`, `archive`, `markRead`, `lock`… each take a `where` union of every filter they serve (`delete(db, { klassLevelId } | { featId } | { aptitudeId })`, `archive(db, { id } | { userId })`), never a `findManyByX` / `deleteByX` / `archiveAllForX` sibling: `arkyvree/method-names` reports a name with a filter word (`By`, `For`, `In`, `On`, `From`, `All`). A variant exists only when its result differs, named by that result (`countPerRuleset`, a Map). When a union's branches run different queries, the public method dispatches to a private method per branch
- Use `this.where([...])` with `"key" in where && eq(...)` to build conditions from union types
- A query whose `where` is a union builds its WHERE with `this.branchWhere(keys, rest)`: `keys` are the conditions that pick its rows, one per branch, `rest` those that narrow them (`isNull(deletedAt)`, `rulesetId`, `status`). A `where` that matches no branch throws, instead of a write reaching every row or a read returning any
- A read is named by what it returns: `findOne` a row, `findMany` an array, `findPage` a page (`findPage(db, where: { ...filters, search?, orderBy?, orderDir? }, pagination: { limit: number; page: number })`). A read whose result has another shape says which: `findOneWithBlob` (a row and its blob), `findOptionPage` (a picker's options), `findGrants`, `findIds`, `findRole`
- Pagination goes in a **separate `pagination` param**, never mixed into `where`
- `BaseRepository` holds a repository's core (`table`, `where`, `branchWhere`, `visibility`, `orderBy`, `lock`). Everything else is a concern in `server/repositories/concerns/`, a mixin the repository includes when it uses it, the way Ruby includes a module: `class CampaignsRepository extends include(BaseRepository<typeof campaignsInCampaign>, Paginates, Searches)` (`include` from `server/mixins.ts`). The concerns are `Paginates` (`paginate`, `paginated`, `withPagination`; the `Paginated` type, `paginateItems`, and `fetchEveryPage` for every page of a `findPage`), `Searches` (`search`, `fuzzySearch`, `searchOrderBy`), `ScopesToRuleset` (`buildRulesetCondition`, `RulesetEntityFilters`; the repository names its `entityType`), `ChecksRulesetUse` (`rulesetOrDescendant`), `ResolvesCopies` (`idMatches`, `excludeIds`), `GuardsStaleEdits` (`casUpdatedAt`), `GrantsPerLevel` (`grantedAt`) and `ChecksExistence` (`exists`, through `findOne`). A concern adds methods, never state
- Use `this.withPagination(pagination, callback)` for paginated queries. For join queries that return non-model types, use `this.paginate()` / `this.paginated()` directly
- Use `this.search(search, [columns])` for text search — returns `SQL | false`, use `|| undefined` when passing to `and()`
- Use `this.orderBy(column, direction)` for sorting — never hardcode `desc()`/`asc()` directly (`arkyvree/order-through-repository`)
- Search sentinel is `false` (not `undefined`) for consistency with `this.where()` filtering
- A query across every ruleset entity's table is a `RulesetEntities` method (`repositories/rulesets/RulesetEntitiesRepository.ts`; `entityTables.ts` maps each type to its table and lists `RULESET_ENTITY_TYPES`). A read that must see stored ids, unresolved by copy-on-write (sibling losers), calls its repository inside `withCowContext(undefined, …)` instead of querying the table itself
- A ruleset entity's repository extends `RulesetEntityRepository` (its `create` / `update` / `delete`, and the concerns every entity's list and edit use: `Paginates`, `Searches`, `ScopesToRuleset`, `GuardsStaleEdits`) and types its list's `where` as `RulesetEntityFilters<{ …its own filters }>`. A bulk insert is `createMany(db, rows[])`. An in-use check joins the character's ruleset with `this.rulesetOrDescendant(column, rulesetId)`
- A level's picks' repositories (`CharacterLevelSkills` / `Feats` / `Powers`) extend `LevelPicksRepository` (`repositories/characters/`): its in-use checks by column (`existsPick`, `existsPickFromExtension`), `createMany` and `delete`; each keeps its `exists` dispatch and its `findMany`, by the picked entity's name

## Frontend Architecture

**Mobile First:**

- Develop mobile first — all new components and layouts must work on small screens (375px) before scaling up
- Use `useIsMobile()` hook (`client/src/hooks/useIsMobile.ts`) for mobile-specific branching
- Use MUI responsive sx props (`{ xs: ..., sm: ..., md: ... }`) over static values
- All `<Dialog>` components must include `fullScreen={isMobile}` (`arkyvree/dialog-conventions`). A full-screen dialog has no backdrop to tap, so every dialog needs its own way out: a Close or Cancel button
- Never use hover-only interactions without a touch-friendly fallback. A table's row actions spread `ROW_ACTIONS_HOVER_SX` into the row's `sx` and `ROW_ACTIONS_SX` into their box (`className="row-actions"`): revealed on hover with a pointer, always shown on touch screens and while focused

**Components:**

- Functional components with explicit prop interfaces
- Every control has an accessible name. An icon-only `IconButton` takes an `aria-label` (a `Tooltip` around it names it, but not when the tooltip wraps a `<span>` for a disabled button; `arkyvree/accessible-icon-buttons`). A `Tooltip` on an element that already has text (a chip, a list option, a labelled button) takes `describeChild`, otherwise its title replaces the element's name. A switch or checkbox is the `control` of a `FormControlLabel`, and a dialog without a `DialogTitle` points `aria-labelledby` at its heading
- Everything a click opens is reachable from the keyboard. A row or card that opens or expands on click spreads `clickableProps(onActivate)` and puts `CLICKABLE_SX` in its `sx` (`components/common`): focusable, activated with Enter or Space, with a focus ring. A control inside it stops its click from reaching the row
- Group related components in folders with `index.ts` exports. Code outside a folder imports it through its `index.ts`, never a file inside it; files within the folder (its subfolders included) import each other directly, and a subfolder with its own `index.ts` is imported through that
- An `index.ts` exports what code outside its folder uses. An entry, or a whole `index.ts`, that nothing imports is dead code: delete it. Page folders have none: routes import each page file directly (most lazily, so each gets its own chunk)

**API Layer:**

- RPC client (`client/src/services/rpc.ts`) wraps Hono's `hc` client with `ApiError` class for typed error handling
- `ApiError` includes `status` (HTTP code) and `errorName` (server error class name)
- The RPC fetch throws `ApiError` on every non-2xx response, so never check `response.ok`. Read bodies with `parseResponse(rpc.api.x.$get(...))` (re-exported from `rpc.ts`), which also narrows to the success type. To react to a specific status (e.g. show "not found"), catch `ApiError` and test `error.status`
- Use `InferRequestType` / `InferResponseType` from `hono/client` for all API types — never recreate manually
- Queries shared between a page and a prefetch (sidebar hover, card hover) live in `client/src/lib/queries.ts` as `queryOptions` factories, so the key, page size and params can't drift apart. Ruleset and campaign tab lists do the same in `pages/rulesets/details/sectionQueries.ts` and `pages/campaigns/details/sectionQueries.ts`, and so do the detail pages that a table row prefetches on hover: the customization page's entity in `pages/rulesets/customization/entityQueries.ts`, the simple entity pages (abilities, skills, saves…) in `pages/rulesets/details/entities/entityDetailQueries.ts`, and the class page and its tabs in `pages/rulesets/details/classes/classSectionQueries.ts`. A page renders with its factory and the hover prefetch (ruleset tab, campaign card, table row) goes through it. Every query key comes from `lib/queryKeys.ts` (`arkyvree/query-keys`: a key written as an array spreads one first)

**State Management:**

- **Server state**: TanStack React Query for all API data
- **Auth state**: Zustand store (`stores/authStore.ts`) with localStorage persistence
- **Form state**: React Hook Form — use `form.reset()` to populate edit forms, never `key={}` remounting or `defaultValue={}`. Map a nullable text column to `""` in the form values (`description: x.description ?? ""`): an input holds `""`, so `undefined` makes the form dirty on mount. A custom input bound through `Controller` passes `field.ref` to the input element (`inputRef`), so a failed submit can focus it

**Hooks & Patterns:**

- `useDebouncedValue(value, delay?)` — shared hook for debouncing search inputs (default 300ms); a cleared value applies at once, so resetting a search never filters by the old text
- `useOnChange(value, onChange)` — resets the state a prop drives in the render that sees the prop change (a dialog's fields when it opens, an input that follows its controlled value), never an effect that sets state (`react/set-state-in-effect`); derive what can be derived during render instead
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
- Mutations use `.mutate()` with `onSuccess`/`onError` callbacks, not `.mutateAsync()` (`arkyvree/client-apis`)

**Shared UI building blocks** (`components/common`): `PageHeader` (top of every list / account page), `ListCard` + `ListCardGrid` + `InfoPill` (ruleset, character and campaign grids), `DetailPageHeader` + `SectionTabs` (ruleset / campaign pages), `PageActionButton` (the create action in a list page header and empty state), `LoadMoreButton` (paginated lists), `BlankState` (empty lists; pass the icon component, it applies the standard size and tint), `SectionContent` (a tab's centered column), `PageError` (a page that failed to load, with its way back; `loadFailureMessage(what, error)` from `lib/errorMessage.ts` gives its text. Show it only when there's no data (`if (!data)`), so a failed background refetch doesn't replace a loaded page. Pages showing a record others control (campaign, campaign character, shared sheet) also show it on `accessLost(error)`: a 404 / 403 means it was deleted or access was revoked), `ActionMenuItem` (a page's action menu item, colored by intent), `NameField` / `DescriptionField` / `EmailField` / `PasswordField` (with `nameRules` from `lib/validation.ts`; a number field validated by the form takes `wholeNumberRules(min, required?)` from there instead of a native `min`, which would block the submit before the field shows why), `SelectField` (a form's select), `RulesetPicker` + `BaseRulesetAlert` (a create dialog's ruleset), `ValidationIssueList`. A select outside a form is a `TextField select`: `FormControl` + `InputLabel` + `Select` leaves the combobox without an accessible name. Ruleset tables use `DescriptionCell` and `AptitudeChipsCell`, and spell lists `SpellLevelFilter` (`pages/rulesets/components`). Formatting helpers live in `lib/formatNumeric.ts` (`formatSigned`, `formatCount`, `formatCost`, `formatWeight`) and `lib/errorMessage.ts`; an empty value reads "—". Reuse them rather than restyling a copy.

**Toast/Snackbar:**

- Queue-based `SnackbarProvider` in `contexts/ToastContext.tsx` — notifications process sequentially
- Use `useSnackbar()` hook: `snackbar.success()`, `snackbar.error()`, etc.
- Never use `console.error` for user-facing errors — always use snackbar

**Loading Indicators:**

- Always use `<DiceSpinner>` (`components/common/DiceSpinner.tsx`) — never MUI `CircularProgress` (`arkyvree/client-apis`)
- For Buttons, use the wrapper API so the button doesn't shrink when loading flips: `<DiceSpinner size="small" loading={isPending}>Save</DiceSpinner>` as the Button child. Pair with `disabled={isPending}`. Keep any static `startIcon` outside the wrapper.
- For Suspense fallbacks and full-section loaders, use standalone `<DiceSpinner />` (default medium); it centers itself, so give it the block's spacing through `sx` (`<DiceSpinner sx={{ py: 4 }} />`) instead of wrapping it in a Box

**Dialog Conventions:**

- Pick the wrapper by purpose — there is no lint rule to choose between them, only a convention:
  - **`CreateDialog` / `EditDialog`** (from `StandardDialogs.tsx`): standard create / edit shapes. Default for create or update flows.
  - **`FormDialog`**: any other dialog that contains a React Hook Form. Binds the form, registers with the global dirty-tracker, blocks backdrop / Escape close while dirty.
  - **`ConfirmDialog` / `DeleteDialog`** (from `StandardDialogs.tsx`): yes/no confirmations. Set `confirmColor` by intent (`warning` for Archive / Leave, `success` for Publish, `error` for destructive) and `confirmLabel` to the action ("Archive Character", not "Confirm"). `DeleteDialog` is the `error` preset.
  - **`Modal`**: info dialogs and manager dialogs that don't bind a form. **Never wrap a `<form>` in `Modal`** — Modal skips the dirty-close guard, so backdrop click / Escape discards typed input (`arkyvree/dialog-conventions`).
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

- Never skip failing tests or use mocks (`arkyvree/test-conventions`: no `.skip`, `.only`, `.todo`, `.fixme`, `.if` / `.skipIf`, no `mock` / `spyOn`)
- Use seed data from test database
- Run with `bun run test`, or `bun run test:changed` for the files changed from the parent branch
- E2E (`bun run test:e2e`) builds the client for production and serves it with the API from one server on port 8010 (`E2E_PORT`), on a database of its own (`<name>_e2e_<port>`): a copy of the e2e template (`<name>_e2e`), which `bun run test:db:reset` copies from the seeded test database, so a run never locks the unit tests' database. It runs on half the CPU cores locally; pass `--workers N` to change it for one run. `E2E_SKIP_BUILD=1` reuses the last build; `E2E_COVERAGE=1` reports the client code the journeys run (coverage/e2e)
- E2E setup goes through the API (`signIn`, `forkCoreRuleset`, `createCharacter`, `createCampaign`, or `apiOf(page)` from `tests/e2e/support/api.ts`): a journey clicks through only what it tests. Select by role and accessible name, never by `data-testid` (the production build strips MUI's). Every e2e file imports `test` / `expect` from `tests/e2e/fixtures.ts` (`arkyvree/test-conventions` holds both)

**Test Structure:**

- A test named after a module sits at that module's mirror (`arkyvree/test-placement`): `tests/services/campaigns/invites/CampaignInvitesService.test.ts` tests `server/services/campaigns/invites/CampaignInvitesService.ts`, `tests/shared/dnd3.5/skills.test.ts` tests `shared/dnd3.5/skills.ts`. A test of a behavior across modules is named for it, in its area's folder (`tests/services/rulesets/EntityServices.test.ts`, `SiblingSemantics.test.ts`)
- Backend tests: `/tests/routers` (the API, through `tests/support/api.ts`), `/tests/services`, `/tests/rulesets` (character computation, target paths, requirements), `/tests/cache`, `/tests/seeds` (the seeders, the seeded content, the package runner and the test data), `/tests/parser` (the parser tools; the scraper's parsers read the trimmed pages in `tests/parser/fixtures`), `/tests/jobs`, `/tests/middlewares` (the rate limits), `/tests/emails` (the email service and its templates), `/tests/shared` (the shared code, and its enum and operator lists against the schema and the database), `/tests/scripts` (the database scripts' guards, and `prod:diff`'s content comparison: every column of every seeded table), `/tests/lint` (the repo's own lint rules)
- Client tests: `/tests/client` (the client's logic that needs no browser: `lib/`, and pure modules such as the inventory dialogs' `equipment.ts`)
- E2E tests: `/tests/e2e`
- What tests do differently (no CSRF check, rate limit or email, cheap password hashes) reads `isTest` (`server/environment.ts`): `NODE_ENV=test`, which `tests/env.ts` and the e2e server set, never the database's name
- Each test runs in its own transaction, rolled back afterwards (`tests/setup.ts`); a transaction the code opens in it (`withTransaction`, `db.transaction`) is a savepoint on the same connection, rolled back when it throws. In production that transaction is its own, on another connection, so tests don't catch transaction-boundary bugs (what it can see, when it commits). It has a single connection: run service calls that write one at a time, never in a `Promise.all`: concurrent savepoints share a name, so one's failure silently undoes the other's writes
- The ruleset cache outlives the rollback. Write a test's rows into a fork (`createSeededTestRuleset`), not a seeded ruleset; a test that has to write into a seeded one calls `invalidateSeededRuleset(rulesetId)` afterwards, and the setup drops those rules again once the rollback undoes the rows
- CRUD, ownership and copy-on-write of every ruleset entity are tested once, for all of them, in `tests/services/rulesets/EntityServices.test.ts`: an entity's own service test covers only what's particular to it

**E2E directory → Playwright project mapping:**

The directory a new e2e file lives in determines which `project` it runs under. Get this wrong and the file won't be picked up.

- `journeys/` → `journeys` project: every signed-in test. Each signs in itself through the API (`signIn`), as users of its own from `tests/e2e/fixtures.ts`: the worker's `ownerUser` / `inviteeUser` for tests that build their own content, and the test's own `user` for one that changes the user itself (email, password, session, stars), so no test depends on another's order or leftovers. `seedUser`, the seeded characters' owner, is for tests that only read them.
- `auth/`, `navigation/unauthenticated-redirect.e2e.ts` → `guest` project: signed out. Sign-in / sign-up / forgot-password / pre-auth redirects.

Adding a brand-new directory? Update the regex in `playwright.config.ts` (the `testMatch` for the relevant project) — otherwise the files won't run.

**Selector gotchas captured by existing tests:**

- `<Typography component="h3">` renders as `<h3>` and is matched by `getByRole('heading')`; Typography styled only via `sx={{ typography: { xs: "h4" } }}` renders as `<p>` — use text-based selectors there.
- Scope dialog selectors to the open MUI dialog with `[role="dialog"][aria-modal="true"]` or by accessible name: `page.getByRole('dialog', { name: 'Fork Ruleset' })`.
- `<ListItemText primary="Fork" secondary="Create your own editable copy" />` produces an accessible name combining both lines. Use `name: /^Fork\b/`, not `name: /^Fork$/`.
- Filter and sort options live inside popup `<Menu>` components; click the "Filter"/"Sort" tooltip IconButton first, then the `MenuItem`.
- Default submit-button labels diverge per dialog wrapper: `CreateDialog` → "Create", `EditDialog` → "Update", `DeleteDialog` → "Delete", custom dialogs (Fork Ruleset / Archive Campaign / Save Changes) override these. Check the actual component before writing the assertion.

**Shared helpers** — reuse them instead of inlining:

Shared test code lives in `tests/support/` (and `tests/e2e/support/`), one module per topic, never a `helpers.ts` (`arkyvree/no-helpers-modules`):

- `seed.ts`: the seeded ids (`getSeedCtx()`), `findSeededCharacter`, `findPlainItem`, `uniqueId`, `NIL_UUID`; `users.ts`: `makeSession`, `createTestUser`
- `rulesets.ts`: rulesets and seeded forks (`createSeededTestRuleset`, `createSeededTestRulesetWithExtensions`), `invalidateSeededRuleset`; `campaigns.ts`: `createTestCampaign`, `inviteToSlot`; `contributors.ts`: `addRulesetContributor`, `addCharacterContributor`
- `characters.ts`: a character written straight to the database (`createTestCharacter`), created through the service (`createCharacterAs`) or through the API (`postCharacter`); `levels.ts`: class levels and a character's (`createTestKlassLevel`, `findKlassLevel`, `addCharacterLevel`, `addOneLevel`), a character that picked a feat (`pickFeat`); `levelFixtures.ts`: seeded character builds, level plans and level-ups, and masters with their bonded creature
- `database.ts`: `insertRows(table, rows)` for bulk setup, what a callback costs the database (`measure`: its queries and cache hits), a call that must wait on another transaction's lock (`runWhileLocked`); `activities.ts`: a row's `activityTypes`; `jobs.ts`: what was queued (`queuedJobs`, `queuedPdfJobs`), `silentJobHelpers`; `files.ts`: `createExport`, `createTestAttachment`; `storage.ts`: the fake storage backend
- `api.ts`: the typed API client as the seed user (`api`), a guest (`guestApi`) or a new user (`createSignedInUser`), `expectOk` (a 2xx response's body) and `expectStatus` (an error's status)
- `tests/seeds/seededRows.ts`: a seeded ruleset's own rows, for the seed tests; `tests/seeds/freshSeed.ts`: a new system ruleset (or extension) for a seeder test to seed into, and what an entity was seeded with
- `tests/e2e/support/`: signing in (`signIn.ts`: `signIn`, `signedInPage`, the form's `submitSignIn`, and `openContext` for another user's or a guest's context, which the run's coverage records), `characters.ts`, `campaigns.ts` and `rulesets.ts` (`createCharacter`, `createCampaign`, `forkCoreRuleset`, all through the API, and the pages they open), invites (`invitePlayer`, `inviteContributor`, `answerInvite`), `page.ts` (`uniqueName`, since ruleset names are unique across users, `openActionsMenu`, `filterList`, `apiResponse` waits), `emails.ts` (verification and reset codes, OTP, signing up), `notifications.ts`, `levelUp.ts` (the Add Level wizard) and `api.ts` (`apiOf(page)`). They scope dialog interactions to `[role="dialog"][aria-modal="true"]`; the seeded users' credentials are `TEST_USERS` in `tests/fixtures/auth.fixture.ts`
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
