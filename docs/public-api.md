# Public API

A caller outside the app (a script, an agent leveling a character) reads what its user can through the public API,
under `/v1`, signed in with an API key. The app's own API (`/api`) stays the screens', free to change with them; `/v1`
answers in shapes of its own, which stay fixed: v1 may add a key to an answer; it never removes, renames or retypes
one. A client must not refuse a key it doesn't know, so a strict schema in the published document describes an answer
as it is today, never a promise that it holds no other key.

## Keys

- A user makes and revokes keys on the Settings page (`ApiKeysPanel`, through `/auth/api-keys`). A demo account has no
  access to the public API: every key route refuses it (`denyDemoUser`), its Settings page shows no panel, and a key
  whose user is a demo signs in nothing.
- A key's token (`ark_` and 32 random bytes, base64url) is shown once, when it's made: the table (`account.api_keys`)
  keeps its SHA-256 digest, which a request's token is looked up by, and its start, which names it on the page
  (`server/apiKeyTokens.ts`). A revoked key is deleted. A user keeps 10 at most (`MAX_API_KEYS`).
- A key expires when its user chose as they made it: in 30 days, 90 (the form's default) or a year, or never, which its
  form warns works until it's revoked. An expired key is refused as a revoked one is, and the daily cleanup
  (`runCleanup`) deletes it.
- Wherever the user's other sessions are signed out, their keys are revoked too (`signOutEverywhere`): a password
  reset, a password change and the account's deletion.
- A key is for a caller that keeps it secret, outside a browser: `/v1` answers no cross-origin request (no CORS but
  the app's own), so a page on another site can't call it. The CSRF check (`checkCsrf`) skips `/v1`, which reads no
  cookie.
- A request sends it as `Authorization: Bearer <token>`. `apiKeyMiddleware` (`server/middlewares/apiKey.ts`) refuses
  one without a key, with a revoked one, or with one whose user is gone (an archived account, a demo), with a 401, and
  marks the key used, at most once a minute.
- A key acts as its user: `requestSession` is `{ userId }`, the `Session` the services read, so a key sees and
  changes only what its user can, by the checks the services already make. A session's cookie signs in nothing under
  `/v1`.
- Its requests are counted per user, whichever keys of theirs ask (`apiKeyRateLimit`: 120 a minute), and its PDFs,
  which each cost a render, and its image uploads apart (`apiExportRateLimit`: 5 a minute;
  `apiAttachmentUploadRateLimit`: 20), which the app's own routes count per address. An address's
  requests are counted before its key is looked up (`apiAddressRateLimit`: 600 a minute), so a wrong key or none, a
  lookup by digest each, is bounded too, for a client that sends its own address: the address is the first
  `X-Forwarded-For` entry, as the app's limits read it, which a client can set.

## Versions

`server/routers/v1/` is version 1: a router layer over the app's services, each route calling the service the app's
own route calls, with the same access checks, and answering through v1's translators (`translators/V1.ts`): from what
the service returns to v1's shape (`V1.character`). Its routes (`routes.ts`) answer the user a sign-in in front of them
found: `/v1`'s key (`index.ts`), or the MCP server's, whose tools call them in the process ([mcp.md](./mcp.md)).

- Each answer's shape is a zod schema (`schemas/`), named for the document (`.meta({ id: "Character" })`), and its
  translator is typed by the service it reads (`Answer<typeof CharactersService.getCharacter>`) and by that schema
  (`z.infer`): an answer that changes inside the app stops its translator compiling, and v1 is kept before anyone
  outside sees the change.
- v1 is the same whatever a ruleset's base rules: no answer's shape, route or description is one game's. What a
  ruleset's rules name a caller reads from `GET /v1/rules` (`RulesService.getRules`, translated): its entity kinds and
  what each has (groups, tiers, pools, the kind it owns, a progression, its tables, templates: the kind's parts as the
  engine's rules describe them, which its routes check), each kind's fields, the kinds that have modifiers and
  requirements, a list's tiers, the values a progression holds (the keys its answer holds them at: the picks a
  granted entity gives, the list its counts go to, whether its positions count on several, and why a save of its
  tables is refused, null when it isn't), and a new character's form (its fields by key, its picks and scores by
  role). An answer keys those by the rules' own names: an entity's `fields` and `links`, a progression's values past
  its pools (those `GET /v1/rules` names alone: its translator leaves out any other key of the app's answer, so a value
  the app adds reaches v1 only once v1's rules name it), a character's sections, links and scores.
- The v1 tests hold to it too: they read the names they use from `GET /v1/rules` and the answers before them, run on
  the seeded base ruleset whichever base rules it is (`tests/support/v1.ts`: a character made as the rules' form lays
  it out, a fork as the app forks one), and name no game's term.
- A ruleset's entities are read by kind, as the rules name them (`/v1/rulesets/{id}/entities/{kind}`,
  `Engine.storage().standaloneKinds()`), whatever the kind: their columns, their fields under `fields` by the names the
  ruleset declares, and their links with their targets' names. A kind adds what its rules describe: its modifiers and
  requirements, where a character may place it.
- The routers follow the app's, a resource each (`characters/inventory/`, `characters/advancements/`,
  `rulesets/changes/`, `rulesets/customization/modifiers/`…), each route its reads and its writes together.
- A character's sheet answers its columns, what the rules find wrong with it (`validation`), what the user may do with
  it, and its sections as the engine describes them for the app (`sections`: each a `kind`, `key` and `title`, its
  values with the words the app shows them by). The summary's prompts and the modifiers and requirements the engine
  weighed stay out.
- An advancement is read as the app's wizard reads it, by its steps (`GET …/advancements/steps`): a plan is each step's
  payload by its name, in its mechanic's shape, each entry with no other key (a 400, an issue per key at its place:
  `steps.<step>.<index>.<key>`, a `choose` step's `steps.<step>.<advancement>.<index>.<key>`, under `plan.` in a
  picker's plan). `POST …/advancement-plan` answers what a plan comes to and `POST
  …/advancement-plan/options/{step}` a page of a step's options over it: reads that take a plan, too long for a query,
  which save nothing.
- A new version copies the last, replacing only what changed (`const V2 = { ...V1, character: … }`, mounted at `/v2`),
  and v1 keeps working untouched.

## Writes

A write calls the service the app's own route calls, with its checks, and answers what it changed as v1 reads it: a
character's edit, an advancement's save and its removal answer its sheet (`V1.character`), an inventory edit the entry,
an entity's edit the entity (an inherited one's edit its fork's copy, under the copy's id), a customization's edit its
entity's modifiers or requirements. The answer is read after the write, through the read's own service, so a write's
answer is the read's shape. A delete (a character's archive, an entity's, an item removed) answers 204. Two removals
answer as their adding does instead: unstarring a ruleset answers the ruleset with its new star count, and
unsubscribing it from an extension answers its extensions.

- An edit sends back the `updatedAt` it read (a character's, an entry's, a modifier's, a ruleset's), and is refused
  with a 409 when the row changed since, as the app's forms are.
- An advancement is saved as the wizard saves one: a plan's steps, the payloads `POST …/advancement-plan` answered;
  `force` saves it past the rules' issues, as the wizard's confirm does. An edit (`PUT …/advancements/{advancementId}`)
  takes the saved plan (`GET …/advancements/{advancementId}/plan`) without its plan step.
- A fork's entity restored (`POST …/entities/{kind}/{entityId}/restore`) is named by its parent's id, which its copy
  shows as.

## The reference

`GET /v1/openapi.json` answers the OpenAPI 3.1 document of every v1 route, without a key, built as the server starts
(`openApiDocument.ts`) from the routes themselves:

- Each route's `validate` middleware carries its schema (`validation`): its path, its query and its body.
- Each route says what it does and what it answers on success (`describeRoute({ summary, response, status })`), the
  answer's schema its `response`: none for a 204, and none for a file it answers instead of JSON, whose media type
  (`file: "application/pdf"`) the document gives. A route without a description stops the server starting.
- What a route does to what its user reaches (`RouteEffect`: reads, changes, or removes what they won't get back as it
  was) is its method's, a GET reading and a DELETE removing, but where its description's `effect` says otherwise: a
  POST that saves nothing (`advancement-plan`, a target path's completions) reads, and one that discards (a fork's
  entity restored, a contributor leaving, a share link replaced, an invite taken back or turned down) removes. The MCP
  server's tools call a route by it.
- Outside production, `describeRoute` checks each success a route answers against its schema (a strict one: a key it
  doesn't name fails too), so every test that calls a route checks the document describes its answer.

A page answers `{ items, page, nextPage }`, `nextPage` null on the last. An error answers the app's envelope
(`{ error, cause, message }`) with its status, a path no route answers a 404.

## Campaigns, contributors and the rest

- **Campaigns** (`/v1/campaigns`): the key's user's, created on a ruleset (they're its Game Master), edited, archived
  (`DELETE`), restored (`/unarchive`) and deleted for good once archived (`/permanent`), with what the user may do with
  each (`permissions`). Their player slots (`/players`: each one's role, its user and its pending invite, added and
  changed with an address to invite), the invites they sent (`/invites`), and their characters (`/characters`), each as
  the key's user may see it: a character linked `Partial` shows the other players its identity alone (`partial`, its
  sheet's identity section alone), a `Private` one none of them; a sheet's `permissions` are the user's, as the
  character's own sheet answers them, its export the campaign's (the Game Master's too). A campaign's `canLeave` is
  never its last Game Master's. `/linkable-characters` lists the user's player characters a campaign could link. An
  address is the Game Master's to read and to search by in `/players` and `/invites`: a player reads whom by their name
  (`CampaignPlayersService.getPlayers`, `CampaignInvitesService.getInvites`, for the app and v1 alike).
- **Invites to the key's user**: to play in a campaign (`/v1/campaign-invites/{id}`), and to contribute to a character
  or a ruleset (`/v1/character-invites/{id}`, `/v1/ruleset-invites/{id}`), each read and answered (`/accept`,
  `/reject`); a campaign's Game Master takes one back (`/v1/campaign-invites/{id}/revoke`). Another user's invite is a
  404, as the app's own invite pages answer it. An invite's id comes with its notification.
- **Contributors** of a character or a ruleset (`/v1/characters/{id}/contributors`,
  `/v1/rulesets/{id}/contributors`): invited, a ruleset's given another role (`PUT`), removed, and left (`/leave`). A
  contributor is reached through its own record alone: another record's id in the path is a 404
  (`ContributorsService.revokeContributor`, `updateContributorRole` and `CharacterContributorsService.revokeContributor`
  take the record's id, for the app's routes too).
- **Sharing**: a character's share link (`POST`/`DELETE /v1/characters/{id}/share`), and the character it shares,
  read by its token (`/v1/shared-characters/{shareToken}`, a `Character` with no permission, its owner's key's too, as
  the sharing service answers it, and its PDF, made as it's asked for).
- **Notifications** (`/v1/notifications`, the unread ones alone with `unreadOnly`) and **activities**
  (`/v1/activities`): a page of them, a notification marked read, or all of them. Each names what it's about
  (`target`) by its type, as the app records it (`characters`, `campaigns`, `exports`, `player-characters`…), and its
  id.
- **Attachments** (`/v1/attachments`): a record's image (a user's avatar, a character's portrait), read, removed, and
  uploaded in one request: `POST /v1/attachments`, a `multipart/form-data` body with the slot (`recordType`, `recordId`,
  `name`) and the `file`, replacing the image there. The server reads the image's type from its bytes, then stores the
  file and attaches it (`AttachmentsService.setAttachment`), or leaves nothing: it records the file pending before it
  stores it, deletes both when the write or the attach fails, and the hourly sweep of pending files takes one a crash
  left. The app keeps its own two steps, the browser sending the file straight to the storage.

## A PDF, made in the background

A character's PDF takes a render, which the worker makes: the app's user hears of it through a notification, and a
caller asks for it by its export.

1. `POST /v1/characters/{id}/pdf` (its owner or a contributor), or
   `POST /v1/campaigns/{id}/characters/{characterId}/pdf` (its editors or the campaign's Game Master), answers 202 and
   the export, `pending`.
2. `GET /v1/exports/{id}` answers where it stands: `pending` while its job is still to run, `ready` once its file is
   stored, or `failed` (the character can't be exported by the time the worker runs, the render failed its last
   attempt, or its job is gone without storing it).
3. `GET /v1/exports/{id}/download` answers the file (`application/pdf`) once it's ready, for the hour it's kept; a
   pending or failed export is a 409, and one past its expiry, or another user's, a 404.

The export is stored as the PDF is queued (`enqueueCharacterPdf`), its file none and its status `pending`
(`account.exports.status`), and its id goes in the job's payload: the job
(`generatePdf.ts`) fills its file in and makes it `ready`, or marks it `failed`, and notifies the user as before, the
failure's notification naming the export (`data.exportId`). A pending export keeps a day, a ready one an hour, and the
daily cleanup deletes either once it's past. A job an older worker runs, which reads no `exportId` (in the minutes
between the web app's deploy and the worker's, `docs/deployment.md`), stores a new export, as it did; the pending one
it never fills reads `failed` once that job is done: each export's job is queued under its key (`toExportJobKey`),
which `countJobsToRun` looks up in the worker's queue.
