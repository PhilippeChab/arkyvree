import { McpServer } from "@modelcontextprotocol/server";

import type { Caller } from "./tools/calls.ts";
import { registerRouteTools } from "./tools/routes.ts";
import { registerSheetTool } from "./tools/sheet.ts";

/** What an agent reads as it connects: what the app is, how its tools work together, the API's ways. */
const INSTRUCTIONS = [
  "Arkyvree is a programmable ruleset engine for tabletop role-playing games. A ruleset holds entities of the kinds " +
    "its base rules declare; a character is built on a ruleset and advances through its advancements. These tools " +
    "act as the signed-in user, through the app's public API (`/v1`), and see and change only what the user can.",
  "Find a route with `search_routes`, read what it takes with `describe_route`, then call it with the tool " +
    "`search_routes` names for it: `read`, `write`, or `remove` (which archives, deletes or discards: ask the user " +
    "first). `read_sheet` reads a character's sheet, a section or a few at a time.",
  "What a ruleset's rules name (its kinds, their fields, the words it uses) is `GET /v1/rules`: read the words " +
    "from there, never guess them. A page answers `{ items, page, nextPage }`. An edit sends back the `updatedAt` " +
    "it read. An error answers the app's words: its message, and the rules' issues, each naming the entity it's on.",
  "A character advances as the app's wizard plans it: `GET /v1/characters/{id}/advancements/steps` gives its steps, " +
    "`POST …/advancement-plan` answers what a plan comes to and `POST …/advancement-plan/options/{step}` a step's " +
    "options (both read), and `POST …/advancements` saves it. `force` saves past the rules' issues: send it only " +
    "when the user agrees.",
].join("\n\n");

/** The MCP server for one request of the caller's user: its tools, each acting as them. */
export function buildMcpServer(caller: Caller) {
  const server = new McpServer({ name: "arkyvree", title: "Arkyvree", version: "1" }, { instructions: INSTRUCTIONS });
  registerRouteTools(server, caller);
  registerSheetTool(server, caller);
  return server;
}
