import { describe, expect, test } from "bun:test";

import Modules from "@/engine/api/Modules.ts";
import RulesEngine from "@/engine/api/RulesEngine.ts";
import StorageEngine from "@/engine/api/StorageEngine.ts";
import type { KindCapabilities } from "@/engine/core/entities/index.ts";
import type { EntityKindDeclaration, RulesetModule } from "@/engine/core/module/index.ts";
import type { StandaloneKind } from "@/engine/core/view/index.ts";
import { Engine, type EntityAction, type EntityKinds, RulesError } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import type { BaseRules } from "@/shared/enums.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

/** A kind of a registered module, and what its rules' class says it can do. */
interface ClassKind {
  baseRules: BaseRules;
  capabilities: KindCapabilities;
  type: StandaloneKind;
}

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

/**
 * Every registered module's kinds no other owns, as its storage declares them, each with what its rules' class says it
 * can do (`capabilitiesOf`): what a kind's description and actions are held to, from the class's side.
 */
function readClassKinds(): ClassKind[] {
  return Modules.all().flatMap(([baseRules, module]) =>
    module.storage.registries.entityTypes.flatMap(({ ownerType, type }) => {
      if (ownerType !== null) return [];
      const kind = type as StandaloneKind;
      return [{ baseRules, capabilities: module.entities.capabilitiesOf(kind), type: kind }];
    }),
  );
}

/** A registered module whose rules declare its kinds as `kinds` says, and whose entities answer as `entities` says. */
function withKinds(
  module: RulesetModule,
  kinds: (declared: EntityKindDeclaration[]) => EntityKindDeclaration[],
  entities: Partial<RulesetModule["entities"]> = {},
): RulesetModule {
  const rules = module.ruleset.describeRules();
  const ruleset = { describeRules: () => ({ ...rules, kinds: kinds(rules.kinds) }) };
  return {
    ...module,
    entities: Object.assign(Object.create(module.entities) as RulesetModule["entities"], entities),
    ruleset: ruleset as unknown as RulesetModule["ruleset"],
  };
}

describe("The rules' engine", () => {
  // Each registered kind's class is the one declaration: its description must say all of it, nothing dropped
  test("describes each kind no other owns as its rules' class declares what it can do", () => {
    const described = Engine.rules().describeAll();
    const kinds = readClassKinds();
    expect(kinds.length).toBeGreaterThan(0);
    for (const { baseRules, capabilities, type } of kinds) {
      const kind = described[baseRules].kinds.find((each) => each.type === type);
      expect({
        type,
        described: !!kind,
        copies: !!kind?.copies,
        families: kind?.families,
        levels: !!kind?.levels,
        lockedName: kind?.lockedName,
        partitioned: !!kind?.partitioned,
        pools: kind?.pools && { param: kind.pools.param, role: kind.pools.role },
        progression: kind?.opens === "progression",
        readOnly: !!kind?.readOnly,
      }).toEqual({
        type,
        described: true,
        ...capabilities,
        families: capabilities.families,
        lockedName: capabilities.lockedName,
        pools: capabilities.pools,
      });
    }
  });

  // Its description and its actions read the same declaration: each action and list filter as its class says
  test("acts on each kind as its rules' class declares what it can do, in a seeded ruleset", async () => {
    const { rulesetId } = await getSeedCtx();
    await withRulesetScope(db, rulesetId, async (scope) => {
      const engine = Engine.for(scope);
      const kinds = readClassKinds().filter(({ baseRules }) => baseRules === scope.ruleset.baseRules);
      const roles = [...new Set(kinds.flatMap(({ capabilities: { pools } }) => (pools ? [pools.role] : [])))];
      expect(kinds.length).toBeGreaterThan(0);
      for (const { capabilities, type } of kinds) {
        const { copies, families, levels, partitioned, pools, readOnly } = capabilities;
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
          copies: COPIES.map(() => copies),
          groups: !!families,
          families: families && true,
          levels,
          partitioned,
          pools: roles.map((role) => pools?.role === role),
        });
      }
    });
  });

  test("refuses renaming an entity whose name its kind locks, in the words its form shows", async () => {
    const { rulesetId } = await getSeedCtx();
    await withRulesetScope(db, rulesetId, async (scope) => {
      const locking = readClassKinds().filter(
        ({ baseRules, capabilities }) => baseRules === scope.ruleset.baseRules && capabilities.lockedName,
      );
      // The registered modules lock some kind's names: with none, this test would check nothing
      expect(locking.length).toBeGreaterThan(0);
      for (const { capabilities, type } of locking) {
        const { field, reason } = capabilities.lockedName!;
        const entityType = type as keyof EntityKinds;
        const locked = scope.rulesetData.rows(entityType).find((entity) => entity.fields[field] === true);
        expect({ type, locked: !!locked }).toEqual({ type, locked: true });
        expect(() =>
          Engine.for(scope)
            .entities(entityType)
            .planEdit(locked!.id, { name: `${locked!.name}, renamed` }),
        ).toThrow(reason);
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

  test("refuses, as it's built, a module whose kinds' declarations its rules or storage contradict", () => {
    const [[baseRules, module]] = Modules.all();
    const storage = StorageEngine.shared();
    const build = (broken: RulesetModule) => () => new RulesEngine([[baseRules, broken]], storage);
    const plain = readClassKinds().find(({ capabilities }) => !capabilities.copies)!;
    const unknown = { icon: "help", type: "unknown-kind" as StandaloneKind };
    expect(build(withKinds(module, (kinds) => [...kinds, unknown]))).toThrow("No entity kind unknown-kind");
    const worded = (kinds: EntityKindDeclaration[]) =>
      kinds.map((kind) => (kind.type === plain.type ? { ...kind, copies: { locked: [], most: 1 } } : kind));
    expect(build(withKinds(module, worded))).toThrow(`${plain.type} make no copies`);
    const capabilitiesOf = (type: StandaloneKind) => ({
      ...module.entities.capabilitiesOf(type),
      lockedName: { field: "noSuchField", reason: "Locked" },
    });
    expect(build(withKinds(module, (kinds) => kinds, { capabilitiesOf }))).toThrow("noSuchField");
  });
});
