import { describe, expect, test } from "bun:test";

import StorageEngine from "@/engine/api/StorageEngine.ts";

describe("A character's row", () => {
  test("reads a stored number of 1e21 or more", () => {
    const row = StorageEngine.shared().characterRowOf({ fields: [{ field: "CHARACTER_XP", value: 1e21 }], links: [] });
    expect(row.xp).toBe(1e21);
  });

  test("writes a number, refusing a blank or a word for one, as its number column does", () => {
    const write = StorageEngine.shared().characterWriteOf({ xp: "1500" });
    expect(write.fields).toEqual([{ field: "CHARACTER_XP", kind: "number", value: 1500 }]);
    expect(() => StorageEngine.shared().characterWriteOf({ xp: "" })).toThrow("Not a number");
    expect(() => StorageEngine.shared().characterWriteOf({ xp: " " })).toThrow("Not a number");
  });
});
