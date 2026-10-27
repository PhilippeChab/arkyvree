import { describe, expect, test } from "bun:test";

import { Engine, type EntityAction, type EntityKinds, RulesError } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

/** The actions a kind's copies take, which a kind that makes none refuses. */
const COPIES: EntityAction[] = ["duplicate", "templates", "variants"];

/** The actions a kind's writes take, which a read-only kind refuses. */
const WRITES: EntityAction[] = ["create", "update", "delete"];

/** Whether a call goes through, rather than its rules refusing it (`RulesError`). */
function accepts(call: () => unknown): boolean {
  try {
    call();
    return true;
  } catch (error) {
    if (error instanceof RulesError) return false;
    throw error;
  }
}

describe("The rules' engine", () => {
  // What a kind can do its class declares once: its description and its actions read the same declaration
  test("describes what each kind can do as its rules act on it, in a seeded ruleset", async () => {
    const { rulesetId } = await getSeedCtx();
    await withRulesetScope(db, rulesetId, async (scope) => {
      const engine = Engine.for(scope);
      const { kinds } = Engine.rules().describeAll()[scope.ruleset.baseRules];
      const roles = [...new Set(kinds.flatMap(({ pools }) => (pools ? [pools.role] : [])))];
      for (const { copies, families, levels, partitioned, pools, readOnly, type } of kinds) {
        const entityType = type as keyof EntityKinds;
        const lists = (filters: Record<string, unknown>) =>
          accepts(() => engine.entities(entityType).openList(filters));
        expect({
          type,
          writes: WRITES.map((action) => accepts(() => engine.entities(entityType, action))),
          copies: COPIES.map((action) => accepts(() => engine.entities(entityType, action))),
          groups: accepts(() => engine.entities(entityType, "groups")),
          families: families && lists({ [families.field]: "Family" }),
          levels: lists({ tier: "1" }),
          partitioned: lists({ partition: "Partition" }),
          pools: roles.map((role) => lists({ [role]: NIL_UUID })),
        }).toEqual({
          type,
          writes: WRITES.map(() => !readOnly),
          copies: COPIES.map(() => !!copies),
          groups: !!families,
          families: families && true,
          levels: !!levels,
          partitioned: !!partitioned,
          pools: roles.map((role) => pools?.role === role),
        });
      }
    });
  });

  test("refuses renaming an entity whose name its kind locks, in the words its form shows", async () => {
    const { rulesetId } = await getSeedCtx();
    await withRulesetScope(db, rulesetId, async (scope) => {
      const { kinds } = Engine.rules().describeAll()[scope.ruleset.baseRules];
      for (const { lockedName, type } of kinds) {
        if (!lockedName) continue;
        const entityType = type as keyof EntityKinds;
        const locked = scope.rulesetData.rows(entityType).find((entity) => entity.fields[lockedName.field] === true);
        expect({ type, locked: !!locked }).toEqual({ type, locked: true });
        expect(() =>
          Engine.for(scope)
            .entities(entityType)
            .planEdit(locked!.id, { name: `${locked!.name}, renamed` }),
        ).toThrow(lockedName.reason);
      }
    });
  });

  // A revert writes the kind's entity: a kind its rules keep to themselves has none to restore
  test("restores every kind no other owns that takes an edit", async () => {
    const { rulesetId } = await getSeedCtx();
    await withRulesetScope(db, rulesetId, async (scope) => {
      const editable = Engine.storage()
        .standaloneKinds()
        .filter((type) => accepts(() => Engine.for(scope).entities(type, "update")));
      expect(Engine.rules().restorableKinds()).toEqual(editable);
    });
  });
});
