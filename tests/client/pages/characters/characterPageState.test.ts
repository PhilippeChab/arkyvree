import { describe, expect, test } from "bun:test";

import { characterPageState } from "@/client/src/pages/characters/characterPageState.ts";

describe("A character page's router state", () => {
  test("opens the Add Level wizard only when asked to, anything else in it ignored", () => {
    expect(characterPageState({ openLevelUp: true, from: "/characters" })).toEqual({ openLevelUp: true });
    expect(characterPageState({ openLevelUp: "true" })).toEqual({});
    expect(characterPageState(undefined)).toEqual({});
  });
});
