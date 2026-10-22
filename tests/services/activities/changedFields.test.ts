import { describe, expect, test } from "bun:test";

import { getChangedFields } from "@/server/services/activities/changedFields.ts";

describe("getChangedFields", () => {
  test("records each field an update gives another value, a long text's only as changed", () => {
    const existing = { costGp: "10", description: "Old", name: "Longsword" };
    expect(getChangedFields(existing, { costGp: 15, description: "New", name: "Longsword" })).toEqual([
      { field: "costGp", from: "10", to: "15" },
      { field: "description" },
    ]);
  });

  test("leaves out a field the update leaves undefined, which it doesn't write, and records one it clears", () => {
    const existing = { costGp: "10", isTemplate: false, name: "Longsword", sourceItemId: "template" };
    const body = { costGp: undefined, isTemplate: undefined, name: "Longsword", sourceItemId: null };
    expect(getChangedFields(existing, body)).toEqual([{ field: "sourceItemId", from: "template", to: undefined }]);
  });
});
