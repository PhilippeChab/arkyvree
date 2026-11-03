import { describe, expect, test } from "bun:test";

import { toBrief } from "@/server/routers/mcp/tools/sheet.ts";

describe("toBrief", () => {
  test("leaves out a section's layout and long texts, but a row's own values of a layout key's name", () => {
    const section = {
      empty: "Nothing yet",
      key: "list",
      kind: "table",
      table: {
        columns: [{ align: "center", key: "name", label: "Name", slot: "primary", width: "40%" }],
        rows: [{ cells: { name: "First" }, description: "A long text", key: "first", slot: "Second place" }],
      },
      title: "List",
    };
    expect(toBrief(section)).toEqual({
      key: "list",
      kind: "table",
      table: {
        columns: [{ key: "name", label: "Name" }],
        rows: [{ cells: { name: "First" }, key: "first", slot: "Second place" }],
      },
      title: "List",
    });
  });
});
