# Public API

A caller outside the app (a script, an agent leveling a character) reads what its user can through the public API,
under `/v1`, signed in with an API key. The app's own API (`/api`) stays the screens', free to change with them; `/v1`
answers in shapes of its own, which stay fixed.

## Keys

- A user makes and revokes keys on the Settings page (`ApiKeysPanel`, through `/auth/api-keys`). A demo account makes
  none (`denyDemoUser`).
- A key's token (`ark_` and 32 random bytes, base64url) is shown once, when it's made: the table (`account.api_keys`)
  keeps its SHA-256 digest, which a request's token is looked up by, and its start, which names it on the page
  (`server/apiKeyTokens.ts`). A revoked key is deleted. A user keeps 10 at most (`MAX_API_KEYS`), since each key's
  requests are counted apart.
- A key expires when its user chose as they made it: in 30 days, 90 (the form's default) or a year, or never, which its
  form warns works until it's revoked. An expired key is refused as a revoked one is, and the daily cleanup
  (`runCleanup`) deletes it.
- Wherever the user's other sessions are signed out, their keys are revoked too (`signOutEverywhere`): a password
  reset, a password change and the account's deletion.
- A request sends it as `Authorization: Bearer <token>`. `apiKeyMiddleware` (`server/middlewares/apiKey.ts`) refuses
  one without a key, with a revoked one, or with one whose user is gone (an archived account, a demo), with a 401, and
  marks the key used, at most once a minute.
- A key acts as its user: `requestSession` is `{ userId }`, the `Session` the services read, so a key sees and
  changes only what its user can, by the checks the services already make. A session's cookie signs in nothing under
  `/v1`. No key acts for a demo, so a v1 write needs no `denyDemoUser`, which reads the app's session.
- Its requests are counted per key (`apiKeyRateLimit`: 120 a minute), and a character's level choices, which read every
  option of each pool, a character file's import, which builds the character level by level, and a file's check of its
  source, which parses it, per user, whichever keys of theirs ask (`levelChoicesRateLimit`: 20 a minute;
  `apiImportRateLimit`: 10; `apiImportSourceRateLimit`: 30), as are its PDFs, which each cost a render
  (`apiExportRateLimit`: 5), and its direct uploads (`apiAttachmentUploadRateLimit`: 20), which the app's own routes
  count per address. A request with a wrong key or none costs a lookup by digest, as a wrong session cookie does the
  app's.
- A ruleset is read as the app reads it: any ruleset by its id, a private one too, as `/api` answers it to any signed-in
  user. The lists (`GET /v1/rulesets`) list what the user's scope does.

## Versions

`server/routers/v1/` is version 1: a router layer over the app's services, each route calling the service the app's
own route calls, and answering through v1's translators (`translators/V1.ts`), one per kind: from what the service
returns to v1's shape (`V1.character`), and from a v1 request to what the service takes (`V1.levelChoicesQuery`).

- Each answer's shape is a zod schema (`schemas/`), named for the document (`.meta({ id: "Character" })`), and its
  translator is typed by the service it reads and by that schema (`z.infer`): an answer that changes inside the app
  stops its translator compiling, and v1 is kept before anyone outside sees the change.
- An answer names things: a character's feats are "Power Attack", their ids beside them. Timestamps, the links the
  screens read and the owner's private notes stay out. A kind is named as the app's screens name it: a class
  (`classes`, `class-levels`), a spell (`spells`, the code's powers), an aptitude (the pool a feat or a spell is picked
  in).
- A ruleset's entity answers its columns, named, and the fields its ruleset declares for it under `fields` (what's left
  of its row past its table's columns): what a write sends back in `fields`, as `GET /v1/rulesets/{id}/fields`
  declares them.
- A new version copies the last, replacing only what changed (`const V2 = { ...V1, character: … }`, mounted at `/v2`),
  and v1 keeps working untouched.

## The reference

`GET /v1/openapi.json` answers the OpenAPI 3.1 document of every v1 route, without a key, built as the server starts
(`openApiDocument.ts`) from the routes themselves:

- Each route's `validate` middleware carries its schema (`validation`): its path, its query and its body.
- Each route says what it does and what it answers on success (`describeRoute({ summary, response, status })`), the
  answer's schema its `response`: none for a 204, and none for a file it answers instead of JSON, whose media type
  (`file: "application/pdf"`) the document gives. A route without a description stops the server starting.
- Outside production, `describeRoute` checks each success a route answers against its schema (a strict one: a key it
  doesn't name fails too), or a file's media type, so every test that calls a route checks the document describes its
  answer.

A page answers `{ items, page, nextPage }`, `nextPage` null on the last. An error answers the app's envelope
(`{ error, cause, message }`) with its status, a path no route answers a 404.

## A character's choices at its next level

`GET /v1/characters/{id}/level-choices` answers what the level-up wizard reads a step at a time, in one request:

- `classes`: the classes the character can take, each with its next level and its hit die, and the requirements it
  doesn't meet (`requirements`, `[UNMET]` marked); `eligible` once it meets them and has a level left (`levelsLeft`,
  whatever their classes).
- The level is the next one, after the character's levels: none planned before it, none edited. A planned level is
  refused as the wizard refuses to plan it: a class the character has no next level of (404), or one it doesn't qualify
  for, or any once it has no level left (422). Ability increases that can't be the level's (at a level that takes none,
  past what it gives, or raising one twice) are refused (400): the other steps would build the character with them.
  Those sent so far may fall short of what it gives.
- With `classId`, the planned level of that class (`level`): whether an ability increase is due, the skill points and
  each skill's ranks before the level, the most it may reach with the level's points alone, its ranks per point and what
  the points sent for it come to (`pointsSpent`, `ranksAdded`), each feat slot (`aptitude`, `count`) with the feats that
  qualify for it, and each spell slot by spell level with the spells that do, with the picks made so far:
  `abilityIncreases=abilityId:amount;…`, `skillPoints=skillId:points,…`, `feats=featId:aptitudeId,…`,
  `spells=spellId:aptitudeId,…`. A slot's `count` is its room at the level, the picks so far counted in it, and `picked`
  lists the picks that fit, a pick past its aptitude's room left out. A shared aptitude's room is one, which a feat or a spell
  fills: it shows as a feat slot and a spell slot both, each `shared`.

The engine opens the choices whole, in one operation (`levelUp().openLevelChoices`): the class picker, the planned
level's steps, and a picker for each pool with room left, which checks its options against the character with the picks
that fit. The levels' service (`CharacterLevelsService.getLevelChoices`) reads the character once, asks it, and reads
each picker's options, every page of them.

The level is then saved whole, as the app saves one (`POST /v1/characters/{id}/levels`): its class and the class's level
(`level.class`), its hit points, ability increases, skill points, and its feats and spells, each in the aptitude its
slot is. The engine checks it and the character with it, as it checks the wizard's save, refusing what it finds wrong
unless the save is `force`d, and the answer is the character's sheet.

## Writes

Each write calls the service the app's own route calls, its body a v1 shape translated to what the service takes
(`V1.raceRequest`, `V1.levelSaveRequest`) where v1 names a column apart (a class's `hitDie`, a race's `speed`, a skill's
`abilityId`, an item's `cost` and `template`, a requirement's `group`).

- A create answers what it made (201), an update what it changed (200), each read back as its read answers it (a
  campaign's as `GET /v1/campaigns/{id}` reads it); a removal (an archive, a delete, a contributor's removal, leaving)
  answers nothing (204), as a star does. An action answers what it acts on (a fork the new ruleset, a publish the
  ruleset, an invite's answer its status), and a queued PDF its export (202).
- An entity's update takes what its create requires (its name; a race's size and speed, a save's or a skill's ability,
  a language's type), as the document marks them, and keeps the rest its body leaves out (a description, an item's
  cost, a spell's save); a ruleset's, an inventory entry's and a saved level's require nothing (v1 reads the entry or
  the level first, where its service takes it whole). A list it names (a feat's aptitudes, a class level's feats) it
  replaces whole.
- A fork's change to an entity it inherits is made on a copy of its own, as the app makes it: the answer is the copy,
  under its own id. `POST /v1/rulesets/{id}/{kind}/{entityId}/restore` undoes it, `entityId` the parent's entity.
- Its writes record activities and notify users as the app's do, and tell them over the websocket
  (`publishNotified`, on `/api` and `/v1` alike).
- v1 takes no `updatedAt`: a write never refuses an entity another edit changed since the client read it, which the
  app's forms check. An inventory entry's update, which reads the entry to keep what its body leaves out, refuses
  (409) one that changed between that read and its write. A character's private notes, which v1 never answers, it
  never writes either.
- A modifier's or a requirement's target is a path (`abilities.strength.misc`): `GET /v1/rulesets/{id}/target-paths`
  completes one a segment at a time, or finds every path whose name has a word, and `…/target-paths/check` says what a
  path takes, or what it may have meant.

## Campaigns, contributors and the rest

- **Campaigns** (`/v1/campaigns`): the key's user's, created on a ruleset (they're its Game Master), edited, archived
  (`DELETE`, every player, invite and link kept), restored (`/unarchive`) and deleted for good once archived
  (`/permanent`). Their player slots (`/players`: each one's role, its user and its pending invite, added and changed
  with an address to invite), the invites they sent (`/invites`), and their characters (`/characters`), each as the
  key's user may see it: a character linked `Partial` shows the other players its identity alone (`partial`, its
  `sheet` a `PartialCharacter`), a `Private` one none of them. `/linkable-characters` lists the user's player
  characters a campaign could link: on its exact ruleset, in no campaign.
- **Invites to the key's user**: to play in a campaign (`/v1/campaign-invites`: the latest ten, any status), and to
  contribute to a character or a ruleset (`/v1/character-invites`, `/v1/ruleset-invites`: the pending ones, ten at
  most), each read alone and answered (`/accept`, `/reject`); a campaign's Game Master takes one back
  (`/v1/campaign-invites/{id}/revoke`). Another user's invite is a 404, as the app's own invite pages answer it.
- **Contributors** of a character or a ruleset (`/v1/characters/{id}/contributors`,
  `/v1/rulesets/{id}/contributors`), each by the address they were invited at, with the record's owner: invited,
  a ruleset's given another role (`PUT`), removed, and left (`/leave`). A contributor's routes reach it through its own
  record alone: another record's id in the path is a 404 (`ContributorsService.revokeContributor`,
  `updateContributorRole` and `CharacterContributorsService.revokeContributor` take the record's id).
- **Sharing**: a character's share link (`POST`/`DELETE /v1/characters/{id}/share`), and the character it shares,
  read by its token (`/v1/shared-characters/{shareToken}`, the same `Character` as the user's own, and its PDF, made
  as it's asked for).
- **Notifications** (`/v1/notifications`) and **activities** (`/v1/activities`), from the last three months: a page of
  them, the unread notifications' count and latest, a notification marked read, or all of them but the invites, which
  stay unread until they're answered. Each names what it's about (`target`) by its kind as v1 names it (`classes`,
  `spells`, `campaigns`…), and `/v1/activities/targets/{kind}/{targetId}` answers the app's page of it (a 404 once
  it's gone, a 403 once the user lost access to it).
- **Attachments** (`/v1/attachments`): a record's image (a user's avatar, a character's portrait), uploaded as the app
  uploads it, in two steps: `POST /v1/attachments/direct-uploads` answers where to send the file (`uploadUrl`, with
  `PUT` and its `headers`) and what attaches it; `POST /v1/attachments/{signedId}/attach` then attaches it to its
  slot, replacing the image there.
- **The dashboard** (`/v1/dashboard/stats`): how many campaigns, characters and rulesets the user has.

## A PDF, made in the background

A character's PDF takes a render, which the worker makes: the app's user hears of it through a notification, and a
caller asks for it by its export.

1. `POST /v1/characters/{id}/pdf` (its owner or a contributor), or
   `POST /v1/campaigns/{id}/characters/{characterId}/pdf` (its editors or the campaign's Game Master), answers 202 and
   the export, `pending`. Both count against `apiExportRateLimit`, per user, whatever keys of theirs ask.
2. `GET /v1/exports/{id}` answers where it stands: `pending` while the worker makes it, `ready` once its file is
   stored, or `failed` (the character can't be exported by the time the worker runs, or the render failed its last
   attempt).
3. `GET /v1/exports/{id}/download` answers the file (`application/pdf`) once it's ready, for the hour it's kept; a
   pending or failed export is a 409, and one past its expiry, or another user's, a 404.

The export is stored as the PDF is queued (`enqueueCharacterPdf`), its file none and its status `pending`
(`account.exports.status`, migration `0081_export-status`), and its id goes in the job's payload: the job
(`generatePdf.ts`) fills its file in and makes it `ready`, or marks it `failed`, and notifies the user as before, the
notification naming the export (`data.exportId`). A pending export keeps a day, a ready one an hour, and the daily
cleanup deletes either once it's past. A job queued before exports were stored pending stores a new one, as it did.
