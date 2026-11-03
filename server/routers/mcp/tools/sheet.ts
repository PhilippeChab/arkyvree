import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { Catalog } from "@/server/routers/mcp/Catalog.ts";
import type { v1Character } from "@/server/routers/v1/schemas/characters.ts";

import { type Caller, requestV1, toRoutedPath, toText, toToolResult, toV1Url } from "./calls.ts";

/** A character's sheet, as the public API answers it. */
type Sheet = z.infer<typeof v1Character>;

/**
 * What a sheet's sections hold for the app alone, at any depth, which a brief sheet leaves out: an empty section's
 * words, an edit's confirm dialog, a table's layout, and each entry's long text, which reading the entity answers whole.
 */
const LAYOUT_KEYS = new Set([
  "description",
  "details",
  "edit",
  "empty",
  "failed",
  "fixed",
  "grouped",
  "itemFields",
  "minWidth",
  "portrait",
  "saved",
]);

/**
 * What a table's column holds for the app alone besides (`LAYOUT_KEYS`): how wide, where and how it's drawn. A row's
 * own key of the name (an item's `slot`, where it's held) is its value, which a brief sheet keeps.
 */
const COLUMN_LAYOUT_KEYS = new Set([
  ...LAYOUT_KEYS,
  "align",
  "hideEmpty",
  "noDash",
  "noWrap",
  "slot",
  "strong",
  "width",
]);

/** The route that answers a character's sheet. */
const SHEET_PATH = "/v1/characters/{id}";

/** A sheet with the sections `keys` names alone (all of them when it names none), each brief unless it's `full`. */
function toSheetAnswer(sheet: Sheet, keys: string[] | undefined, full: boolean) {
  const missing = keys?.filter((key) => !sheet.sections.some((section) => section.key === key)) ?? [];
  if (missing.length > 0) {
    const known = sheet.sections.map(({ key }) => key).join(", ");
    return toText(`The sheet has no section ${missing.join(", ")}: its sections are ${known}`, true);
  }
  const sections = keys ? sheet.sections.filter((section) => keys.includes(section.key)) : sheet.sections;
  return toText(JSON.stringify({ ...sheet, sections: full ? sections : sections.map((section) => toBrief(section)) }));
}

/**
 * The tool that reads a character's sheet in an agent's measure: what the rules compute of it (each section's values,
 * its validation) without how the app lays it out, a section or a few at a time. The full sheet is a route's (`GET
 * /v1/characters/{id}`), a spellcaster's tens of thousands of words.
 */
export function registerSheetTool(server: McpServer, caller: Caller) {
  server.registerTool(
    "read_sheet",
    {
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false, readOnlyHint: true },
      description:
        "Reads a character's sheet: its values as the rules compute them, each section's by its `key`, and what the " +
        "rules find wrong with it (`validation`). Brief: without the app's layout or each entry's long text, which " +
        "reading the entity answers",
      inputSchema: z.object({
        characterId: z.string().min(1).describe("The character's id"),
        full: z.boolean().optional().describe("The sheet as the API answers it, layout and long texts included"),
        sections: z
          .array(z.string())
          .optional()
          .describe("The keys of the sections to answer (a section's `key`), all of them when none"),
      }),
      title: "Read a character's sheet",
    },
    async ({ characterId, full = false, sections }) => {
      const url = toV1Url(`/v1/characters/${encodeURIComponent(characterId)}`);
      // An id the router reads as another route's word (`creation`) reads no sheet
      if (!url || Catalog.match("GET", toRoutedPath(url))?.path !== SHEET_PATH)
        return toText(`No character's id is ${characterId}`, true);
      const response = await requestV1(caller, "GET", url);
      if (!response.ok) return await toToolResult(response);
      return toSheetAnswer((await response.json()) as Sheet, sections, full);
    },
  );
}

/** A section's values without what only the app reads of them (`layout`): a table's columns' (`COLUMN_LAYOUT_KEYS`) too. */
export function toBrief(value: unknown, layout = LAYOUT_KEYS): unknown {
  if (Array.isArray(value)) return value.map((entry) => toBrief(entry, layout));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !layout.has(key))
      .map(([key, entry]) => [key, toBrief(entry, key === "columns" ? COLUMN_LAYOUT_KEYS : LAYOUT_KEYS)]),
  );
}
