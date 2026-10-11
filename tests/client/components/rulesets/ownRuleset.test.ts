import { describe, expect, test } from "bun:test";

import { findOwnRuleset } from "@/client/src/components/rulesets/ownRuleset.ts";
import type { RulesetListItem } from "@/client/src/lib/queries.ts";

/** A fork of the user's to play, as the server lists them (its extensions left out). */
function fork(name: string) {
  return { id: name, name, kind: "ruleset" } as RulesetListItem;
}

describe("The ruleset a new character's dialog starts on", () => {
  test("is the user's own, when it's the one they own to play", () => {
    expect(findOwnRuleset([fork("Homebrew")])?.name).toBe("Homebrew");
  });

  test("is none when they own none, or more, where any would be a guess", () => {
    expect(findOwnRuleset([])).toBeUndefined();
    // The server is asked for two: a second says there are more
    expect(findOwnRuleset([fork("Homebrew"), fork("Grimdark")])).toBeUndefined();
  });
});
