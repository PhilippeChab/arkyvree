# MCP server

An agent (Claude Code, Claude, ChatGPT…) uses the app through its MCP server, at `/mcp`: tools over the public API's
routes ([public-api.md](./public-api.md)), which act as the user who signed in, with nothing to install. A client
connects with the server's address and an API key, sent as the public API's is (`Authorization: Bearer <key>`):

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
| `remove` | Calls a route that removes what the user won't get back as it was: an archive, a delete, a fork's changes discarded, a contributor leaving, a share link replaced, an invite taken back or turned down | destructive |
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
- **Sign-in:** the public API's key, as `/v1` reads it (`apiKeyMiddleware`), so a key sees and changes what its user
  can, a demo's key and a revoked one nothing. A request from a browser page of another site (an `Origin` that isn't
  the app's) is refused, as MCP asks of a server over HTTP; the CSRF check skips `/mcp`, which reads no cookie.
- **The routes a tool calls** run in the process (`server/routers/mcp/v1Calls.ts`): v1's routes (`v1/routes.ts`,
  which `/v1` mounts behind its sign-in), with the user the MCP server's sign-in found, passed with the call. Each call
  runs the route's own checks, validation and answer, its errors answered as the app's, and counts toward its user's
  requests as a key's does (`apiKeyRateLimit`); an address's are counted at `/mcp`, before its key's lookup
  (`apiAddressRateLimit`). A call sends on the request's address (`X-Forwarded-For`, `X-Real-IP`), which a route
  that counts per address (an import) counts it by, as it counts a key's call to `/v1`.

## Testing

`tests/support/mcp.ts` connects the SDK's client to the app in the test's process (`connectMcp`), by either protocol,
and reads a tool's result (`callTool`, `callToolRefused`). A test names no game's term: it reads the names it uses from
the API's answers, as v1's do.
