# MCP server

An agent (Claude Code, Claude, ChatGPT…) uses the app through its MCP server, at `/mcp`: tools over the public API's
routes ([public-api.md](./public-api.md)), which act as the user who signed in, with nothing to install. Claude and
ChatGPT connect with the server's address alone, and send their user to the app to allow them ([OAuth](#oauth)); a
client that sends a header connects with an API key too, as the public API's is sent (`Authorization: Bearer <key>`):

```bash
claude mcp add --transport http arkyvree https://rpg.arkyvree.com/mcp --header "Authorization: Bearer ark_…"
```

## The tools

A tool per task the API's routes don't serve as an agent needs, and a few that reach every route: the server stays as
small as an agent's context, a few tools whatever routes v1 adds, and a new route reaches agents as it reaches the
reference.

| Tool | What it does | Marked |
|---|---|---|
| `search_routes` | Finds routes by words of what to do: each one's method, path, summary, and the tool that calls it | read-only |
| `describe_route` | What a route takes and answers: its parameters, its body's and its answer's schemas, and the schemas they name | read-only |
| `read` | Calls a route that reads: a GET, or a POST that saves nothing (a plan answered, a path checked) | read-only |
| `write` | Calls a route that changes: creates, edits, saves | writes |
| `remove` | Calls a route that removes what the user won't get back as it was: an archive, a delete, a fork's changes discarded, a contributor leaving, a share link replaced | destructive |
| `read_sheet` | A character's sheet without the app's layout or each entry's long text, a section or a few at a time | read-only |

- **Which tool calls a route** is what the route does (`RouteEffect`, `server/middlewares/describeRoute.ts`): its
  method's (a GET reads, a DELETE removes, a POST or a PUT changes), but where its description's `effect` says
  otherwise, which a route that only reads or that removes with a POST declares. A tool refuses a route another calls,
  naming the one that does, so a client asks before the one that removes (its MCP annotation `destructiveHint`).
- **The route a tool checks is the one its call reaches:** it refuses a path the URL it calls would read otherwise (a
  `..` it resolves, a `\` it turns to `/`, a `#` it cuts: `toV1Url`), and checks the route by the URL's path as the
  router reads it (`toRoutedPath`: `%63reation` is `creation`).
- **The routes the tools reach** are the API's document's (`openApiDocument`), read as the server starts
  (`server/routers/mcp/Catalog.ts`), but those that take a form or answer a file (an upload, a PDF's download): a tool
  sends and reads JSON.
- **A route's answer** is the tool's result as the API answers it, its JSON as text. An error is the app's envelope
  with its status (`isError`): its message, and the rules' issues, each naming the entity it's on ("Unmet prerequisite
  on …"), which an agent reads to fix its call.
- **A sheet** answers 20 to 40 KB for a mid-level character, most of it the app's layout (a column's width, an empty
  section's words, an edit's confirm dialog) and each entry's long text. `read_sheet` leaves them out (`LAYOUT_KEYS`),
  about half of it, and answers the sections it's asked for alone (by their `key`); `full` answers the sheet whole.
- **The server's instructions**, which a client reads as it connects, say how the tools work together, where a
  ruleset's own words are (`GET /v1/rules`), and how a character advances: the advancement routes in their order, and
  `force` sent only when the user agrees. No tool's name, description or instruction names one game's terms, as v1's
  routes don't.

## Serving

- **The protocol:** the official SDK's (`@modelcontextprotocol/server`), which answers both the 2026-07-28 revision
  (no handshake: each request carries its version) and the 2025 handshake today's clients send, statelessly: each
  request is answered by a server made for it (`buildMcpServer`), so any of the app's machines answers any request. A
  GET or a DELETE, a 2025 session's, answers 405.
- **Sign-in** (`mcpSignIn`): an OAuth access token ([OAuth](#oauth)), or the public API's key, as `/v1` reads it
  (`findKeySignIn`), each acting as its user, a demo's and a revoked one nothing. Without either, a 401 names where the
  sign-in starts (`WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/mcp"`), which
  Claude and ChatGPT read to send their user to the consent page. A read-only key or app is offered the tools that read
  alone (no `write`, no `remove`), and the server's instructions say why; its calls carry it, so the routes refuse it a
  change as `/v1` does. A request from a browser page of another site (an `Origin` that isn't the app's) is refused,
  as MCP asks of a server over HTTP; the CSRF check skips `/mcp`, which reads no cookie.
- **The routes a tool calls** run in the process (`server/routers/mcp/v1Calls.ts`): v1's routes (`v1/routes.ts`,
  which `/v1` mounts behind its sign-in), with the user the MCP server's sign-in found, passed with the call. Each call
  runs the route's own checks, validation and answer, its errors answered as the app's, and counts toward its user's
  requests as a key's does (`apiKeyRateLimit`). An address's failed requests alone are counted at `/mcp`
  (`mcpAddressRateLimit`): Claude's and ChatGPT's servers send every user's requests from a few addresses, which
  counting every request would throttle together. No v1 route counts per address: an import counts per user
  (`apiImportRateLimit`), as its PDFs and uploads do.

## OAuth

Claude (on the web, Desktop, mobile, Claude Code) and ChatGPT sign in to the MCP server with OAuth 2.1, as the MCP
authorization specification asks: the app is the OAuth client, the app (`APP_URL`) its authorization server, and
`/mcp` the resource, its tokens for it alone.

- **Discovery** (`server/routers/wellKnown.ts`): the protected resource's metadata (RFC 9728, at
  `/.well-known/oauth-protected-resource` and `…/mcp`: the resource, `APP_URL/mcp`, and its authorization server), and
  the authorization server's (RFC 8414, `/.well-known/oauth-authorization-server`): S256 PKCE, public clients
  (`none`), Client ID Metadata Documents, the `iss` of each answer (RFC 9207, which ChatGPT's stable redirect needs),
  and the scopes, `read` and `write`.
- **An app names itself by its document's URL** (a Client ID Metadata Document: Claude's
  `https://claude.ai/oauth/claude-code-client-metadata`, ChatGPT's `https://chatgpt.com/oauth/client.json`): the server
  fetches it, an https URL whose host is public, no redirect, 5 KB and 5 seconds at most, and keeps it a day
  (`account.oauth_clients`, `clientMetadata.ts`). It registers nothing first: there's no registration endpoint, which
  the specification deprecates. A redirect URI is one the document lists, a loopback one (Claude Code's
  `http://localhost/callback`) on any port.
- **The sign-in** (`server/routers/oauth/`, `OAuthService`): `/oauth/authorize` checks the app, its redirect URI and
  its PKCE challenge, stores the request (`account.oauth_authorizations`, 10 minutes) and sends the browser to the
  consent page (`/oauth/consent`, the client's), whose session cookie, `SameSite=Strict`, a navigation from the app's
  site doesn't carry, but its own requests do. An app or a redirect URI the server can't check sends the user to the
  consent page with why, never to the app. The user allows the app, reading alone or not (its Read Only switch), or
  turns it down (`/auth/oauth/authorizations/:id/…`): the browser goes back to the app with a code (5 minutes, once)
  and the app's `state`, or `access_denied`.
- **Tokens** (`/oauth/token`, a form an app's server posts): the code, with its PKCE verifier, for a connected app
  (`account.oauth_grants`) and a pair (`account.oauth_tokens`, their SHA-256 digests): an access token (`arka_…`, an
  hour) and a refresh token (`arkr_…`, 30 days), which replaces the pair once. A refresh token used again disconnects
  the app: it was stolen or replayed. Its refusals answer as OAuth does (`invalid_grant`), which an app reads to sign
  in again. `/oauth/revoke` (RFC 7009) disconnects the app of either token. The CSRF check skips both, which read no
  cookie and take an app's server's form with no `Origin`.
- **Connected apps:** Settings lists the user's (`/auth/connected-apps`), each disconnected there, and signing out
  everywhere (a password changed or reset, an account deleted) disconnects them all, as it revokes the keys. The
  daily cleanup deletes expired sign-ins and pairs, and an app left without one.
- **Its writes:** before the user answers, a sign-in locks no account (`withSignInWrite`); its answer and every write
  after it lock the user's (`withAccountWrite`).

## Testing

`tests/support/mcp.ts` connects the SDK's client to the app in the test's process (`connectMcp`), by either protocol,
and reads a tool's result (`callTool`, `callToolRefused`). A test names no game's term: it reads the names it uses from
the API's answers, as v1's do.
