import { describe, expect, test } from "bun:test";

import StorageEngine from "@/engine/api/StorageEngine.ts";
import { Engine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { RULESET_ENTITY_TYPES } from "@/server/repositories/index.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";

describe("A ruleset's engine", () => {
  // An owned entity's delete checks what's in use by the kind its owner declares, before it finds the owner
  test("has each kind declare the kind it owns as its storage stores it, and own entities through `owned` then alone", async () => {
    const { rulesetId } = await getSeedCtx();
    const storage = StorageEngine.shared();
    await withRulesetScope(db, rulesetId, async (scope) => {
      for (const type of RULESET_ENTITY_TYPES) {
        const kind = Engine.for(scope).entities(type);
        const ownedKinds = storage.ownedKinds(type);
        expect({ type, ownedType: kind.ownedType }).toEqual({ type, ownedType: ownedKinds[0] });
        expect({ type, owns: "owned" in kind }).toEqual({ type, owns: ownedKinds.length > 0 });
      }
    });
  });
});
