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
- Wherever the user's other sessions are signed out, their keys are revoked too: a password reset, a password change
  and the account's deletion.
- A request sends it as `Authorization: Bearer <token>`. `apiKeyMiddleware` (`server/middlewares/apiKey.ts`) refuses
  one without a key, with a revoked one, or with one whose user is gone (an archived account, a demo), with a 401, and
  marks the key used, at most once a minute.
- A key acts as its user: `requestSession` is `{ userId }`, the `Session` the services read, so a key sees and
  changes only what its user can, by the checks the services already make. A session's cookie signs in nothing under
  `/v1`.
- Its requests are counted per IP before the key is looked up (`apiClientRateLimit`: 600 a minute), so a request with
  a wrong key or none is limited too, then per key (`apiKeyRateLimit`: 120 a minute); a character's level choices, which
  build the character once for each step and pool they read, apart (`levelChoicesRateLimit`: 20 a minute).
- A ruleset is read as the app reads it: any ruleset by its id, a private one too, as `/api` answers it to any signed-in
  user. The lists (`GET /v1/rulesets`) list what the user's scope does.

## Versions

`server/routers/v1/` is version 1: a router layer over the app's services, each route calling the service the app's
own route calls, and answering through v1's translators (`translators/V1.ts`), one per kind: from what the service
returns to v1's shape (`V1.character`), and from a v1 request to what the service takes (`V1.levelChoicesQuery`).

- Each translator is typed by the service it reads, so an answer that changes inside the app stops its translator
  compiling, and v1 is kept before anyone outside sees the change.
- An answer names things: a character's feats are "Power Attack", their ids beside them. Timestamps, modifiers,
  requirement groups and the owner's private notes stay out.
- A new version copies the last, replacing only what changed (`const V2 = { ...V1, character: … }`, mounted at `/v2`),
  and v1 keeps working untouched.

## Routes

| Route | Answers |
|---|---|
| `GET /v1/characters` | The user's characters, a page at a time (`page`, `limit`, `search`): each its name, race, level and classes |
| `GET /v1/characters/:id` | A character's sheet: its abilities, combat numbers, saves, skills, levels, feats, equipment, spells, validation and bonded creatures |
| `GET /v1/characters/:id/level-choices` | Its choices at its next level, below |
| `GET /v1/rulesets` | Rulesets, a page at a time (`scope`: `base`, `community`, `createdByMe`, `contributedTo`, `starred`; `search`) |
| `GET /v1/rulesets/:id` | A ruleset |
| `GET /v1/rulesets/:id/classes`, `feats`, `races`, `skills`, `spells` | A ruleset's content, a page at a time (`page`, `limit`, `search`) |

A page answers `{ items, page, nextPage }`, `nextPage` null on the last. An error answers the app's envelope
(`{ error, cause, message }`) with its status.

### A character's choices at its next level

`GET /v1/characters/:id/level-choices` answers what the level-up wizard reads a step at a time, in one request:

- `classes`: the classes the character can take, each with its next level and its hit die, and the requirements it
  doesn't meet (`requirements`, `[UNMET]` marked) when it isn't `eligible`.
- A planned level is refused as the wizard refuses to plan it: a class the character has no next level of (404), or
  one it doesn't qualify for, or any once it has no level left (422). Ability increases that aren't the level's (at a
  level that takes none, or more than it takes) are refused (400): the other steps would build the character with them.
- With `classId`, the planned level of that class (`level`): whether an ability increase is due and whether the
  increases sent are the level's (`picked`), the skill points and each skill's ranks before the level, the most it may
  reach with the level's points alone, its ranks per point and what the points sent for it come to (`pointsSpent`,
  `ranksAdded`), each feat slot (`pool`, `count`) with the feats that qualify
  for it, and each spell slot by spell level with the spells that do, with the picks made so far:
  `abilityIncreases=abilityId:amount;…`, `skillPoints=skillId:points,…`, `feats=featId:poolId,…`,
  `spells=spellId:poolId,…`. A slot's `count` is its room at the level, the picks so far counted in it, and `picked`
  lists the picks that fit, a pick past its pool's room left out.

The level is then saved whole, as the app saves one: its class, hit points, ability increases, skills, feats and
spells (a later stage's route).

## Not yet

The issue's later stages: editing characters and rulesets, campaigns and notifications, a route that says whether a
PDF is ready and fetches it, and reference docs generated from the v1 routes' validation schemas.
