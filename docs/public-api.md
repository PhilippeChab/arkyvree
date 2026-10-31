# Public API

A caller outside the app (a script, an agent leveling a character) reads what its user can through the public API,
under `/v1`, signed in with an API key. The app's own API (`/api`) stays the screens', free to change with them; `/v1`
answers in shapes of its own, which stay fixed.

## Keys

- A user makes and revokes keys on the Settings page (`ApiKeysPanel`, through `/auth/api-keys`). A demo account makes
  none (`denyDemoUser`).
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
- Its requests are counted per user, whichever keys of theirs ask (`apiKeyRateLimit`: 120 a minute). An address's
  requests are counted before its key is looked up (`apiAddressRateLimit`: 600 a minute), so a wrong key or none, a
  lookup by digest each, is bounded too, for a client that sends its own address: the address is the first
  `X-Forwarded-For` entry, as the app's limits read it, which a client can set.

## Versions

`server/routers/v1/` is version 1: a router layer over the app's services, each route calling the service the app's
own route calls, with the same access checks, and answering through v1's translators (`translators/V1.ts`): from what
the service returns to v1's shape (`V1.character`).

- Each answer's shape is a zod schema (`schemas/`), named for the document (`.meta({ id: "Character" })`), and its
  translator is typed by the service it reads (`Answer<typeof CharactersService.getCharacter>`) and by that schema
  (`z.infer`): an answer that changes inside the app stops its translator compiling, and v1 is kept before anyone
  outside sees the change.
- A ruleset's entities are read by kind, as the engine names them (`/v1/rulesets/{id}/entities/{kind}`: `feats`,
  `spells`, `classes`…, `Engine.storage().standaloneKinds()`), whatever the kind: their columns, their fields under
  `fields` by the names the ruleset declares, and their links with their targets' names. A kind adds what its rules
  describe: a feat's modifiers and requirements, an item's placement.
- A character's sheet answers its columns, what the rules find wrong with it (`validation`), what the user may do with
  it, and its sections as the engine describes them for the app (`sections`: each a `kind`, `key` and `title`, its
  values with the words the app shows them by). The summary's prompts and the modifiers and requirements the engine
  weighed stay out.
- A level is read as the app's wizard reads it, by its steps (`GET …/levels/steps`): a plan is each step's payload by
  its name, in its mechanic's shape. `POST …/level-plan` answers what a plan comes to and `POST
  …/level-plan/options/{step}` a page of a step's options over it: reads that take a plan, too long for a query, which
  save nothing.
- A new version copies the last, replacing only what changed (`const V2 = { ...V1, character: … }`, mounted at `/v2`),
  and v1 keeps working untouched.

## The reference

`GET /v1/openapi.json` answers the OpenAPI 3.1 document of every v1 route, without a key, built as the server starts
(`openApiDocument.ts`) from the routes themselves:

- Each route's `validate` middleware carries its schema (`validation`): its path, its query and its body.
- Each route says what it does and what it answers on success (`describeRoute({ summary, response, status })`), the
  answer's schema its `response`. A route without a description stops the server starting.
- Outside production, `describeRoute` checks each success a route answers against its schema (a strict one: a key it
  doesn't name fails too), so every test that calls a route checks the document describes its answer.

A page answers `{ items, page, nextPage }`, `nextPage` null on the last. An error answers the app's envelope
(`{ error, cause, message }`) with its status, a path no route answers a 404.

## Not yet

The issue's later stages: editing characters and rulesets, campaigns and notifications, and a route that says whether
a PDF is ready and fetches it.
