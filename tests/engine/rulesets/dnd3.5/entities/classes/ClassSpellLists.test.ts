import { describe, expect, test } from "bun:test";

import { Engine, RulesError } from "@/engine/index.ts";
import type { KlassLevel } from "@/engine/rulesets/dnd3.5/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities, Modifiers } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { createTestUserAndRuleset } from "@/tests/support/dnd3.5/rulesets.ts";
import { thrownBy } from "@/tests/support/errors.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { CLASS_HD } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A seeded aptitude's id and a seeded spell's, by name. */
interface Ids {
  listId: (name: string) => string;
  spellId: (name: string) => string;
}

/** A class's spell lists, as the engine hands them out. */
type Lists = ReturnType<ReturnType<typeof Engine.for>["lists"]>;

/** A class's tables, as the engine hands them out. */
type Tables = ReturnType<ReturnType<typeof Engine.for>["tables"]>;

/**
 * A new user's ruleset with a Witch class, a "Witch Spells" aptitude that's a feat pool (a feat listed in it), and a
 * spell, run in its scope (`check`): the Witch's lists, and the aptitude's and the spell's ids.
 */
async function withFeatPoolWitch(
  check: (lists: Lists, ids: { aptitude: string; spell: string }, tables: Tables) => void,
) {
  const {
    session,
    ruleset,
    aptitudeIds: [aptitude, wizardList],
  } = await createTestUserAndRuleset(["Witch Spells", "Wizard Spells"]);
  const witch = await EntitiesService.createEntity(session, ruleset.id, "classes", {
    name: "Witch",
    fields: { [CLASS_HD]: 6 },
  });
  await EntitiesService.createEntity(session, ruleset.id, "feats", {
    name: "Hex",
    links: { listedIn: [{ toId: aptitude }] },
  });
  const spell = await EntitiesService.createEntity(session, ruleset.id, "spells", {
    name: "Evil Eye",
    links: { listedIn: [{ toId: wizardList, tier: 1 }] },
  });
  await withRulesetScope(db, ruleset.id, async (scope) => {
    const engine = Engine.for(scope);
    check(engine.lists("classes", witch.id), { aptitude, spell: spell.id }, engine.tables("classes", witch.id));
  });
}

/** The seeded core's scope, its Wizard's spell lists, and a seeded spell's id by name. */
async function withWizard(check: (lists: Lists, ids: Ids) => void) {
  const { classMap, rulesetId } = await getSeedCtx();
  await withRulesetScope(db, rulesetId, async (scope) => {
    const { rulesetData } = scope;
    const listId = (name: string) => rulesetData.rows("aptitudes").find((aptitude) => aptitude.name === name)!.id;
    const spellId = (name: string) => rulesetData.rows("spells").find((spell) => spell.name === name)!.id;
    check(Engine.for(scope).lists("classes", classMap.pc["Wizard"]), { listId, spellId });
  });
}

describe("A class's spell lists", () => {
  test("plan a class's first add, with no list of its own, as the list it makes, named for it, and the spells on it", async () => {
    const { classMap, rulesetId } = await getSeedCtx();
    await withRulesetScope(db, rulesetId, async (scope) => {
      const fighter = Engine.for(scope).lists("classes", classMap.pc["Fighter"]);
      const bless = scope.rulesetData.rows("spells").find((spell) => spell.name === "Bless")!.id;
      const plan = fighter.planAdd(undefined, [bless], 1);
      const [made] = plan.writes?.made ?? [];
      expect(made).toMatchObject({ type: "aptitudes", row: { name: "Fighter Spells", description: "" } });
      const madeId = made.row.id!;
      const [listings] = plan.edits[0].links ?? [];
      expect(listings.role).toBe("listedIn");
      // Its other lists kept, the new one past them
      expect(listings.links.at(-1)).toEqual({ tier: 1, toId: madeId });
      expect(listings.links).toHaveLength(3);
      expect(plan.activity).toMatchObject({ listName: "Fighter Spells", toNames: ["Bless"] });
    });
  });

  test("refuse a class's own list that's a feat pool, which its Spell List doesn't show, by its name or by its id", async () => {
    await withFeatPoolWitch((lists, { aptitude, spell }, tables) => {
      expect(tables.describe("spell-lists")).toEqual([]);
      expect(thrownBy(() => lists.planAdd(undefined, [spell], 1))).toEqual(
        new RulesError("conflict", "Witch Spells is a feat pool, so it can't be Witch's spell list"),
      );
      // Nor is it one of the class's lists, by its id
      expect(thrownBy(() => lists.planAdd(aptitude, [spell], 1))).toEqual(
        new RulesError("not-found", "Spell list not found for Witch"),
      );
    });
  });

  test("plan a spell's add as its edit, its other lists kept and the list added at its level", async () => {
    await withWizard((lists, { listId, spellId }) => {
      const plan = lists.planAdd(listId("Wizard Spells"), [spellId("Bless")], 2);
      expect(plan.listedType).toBe("spells");
      expect(plan.edits.map((edit) => edit.entity.name)).toEqual(["Bless"]);
      expect(plan.edits[0].links).toEqual([
        {
          links: [
            { tier: 1, toId: listId("Cleric Spells") },
            { tier: 1, toId: listId("Paladin Spells") },
            { tier: 2, toId: listId("Wizard Spells") },
          ],
          role: "listedIn",
          toType: "aptitudes",
        },
      ]);
      expect(plan.activity).toMatchObject({ entityName: "Wizard", listName: "Wizard Spells", tier: 2 });
    });
  });

  test("plan a spell's removal as its edit, its other lists kept", async () => {
    await withWizard((lists, { listId, spellId }) => {
      const plan = lists.planRemove(listId("Wizard Spells"), spellId("Magic Missile"));
      expect(plan.edits[0].links?.[0].links.map((link) => link.toId)).toEqual([
        listId("Sorcerer Spells"),
        listId("Evocation Specialist Spells"),
      ]);
    });
  });

  test("refuse an add to a class's own list while it casts from other lists, which its Spell List shows instead", async () => {
    const {
      session,
      ruleset,
      aptitudeIds: [blackguard],
    } = await createTestUserAndRuleset(["Blackguard Spells"]);
    const templar = await EntitiesService.createEntity(session, ruleset.id, "classes", {
      name: "Templar",
      fields: { [CLASS_HD]: 8 },
    });
    const [level] = await Entities.create<KlassLevel>(db, "class-levels", { ownerId: templar.id, position: 1 });
    await Modifiers.createMany(db, [
      {
        sourceId: level.id,
        sourceType: "class-levels",
        target: "aptitudes.blackguardspells.1.uses",
        operator: "add",
        value: "1",
        valueType: "number",
      },
    ]);
    const spell = await EntitiesService.createEntity(session, ruleset.id, "spells", {
      name: "Doom",
      links: { listedIn: [{ toId: blackguard, tier: 1 }] },
    });
    await withRulesetScope(db, ruleset.id, async (scope) => {
      const lists = Engine.for(scope).lists("classes", templar.id);
      expect(thrownBy(() => lists.planAdd(undefined, [spell.id], 1))).toEqual(
        new RulesError("conflict", "Templar casts from other spell lists: add the spells to one of them"),
      );
    });
  });

  test("refuse what the rules don't take before the server writes anything", async () => {
    await withWizard((lists, { listId, spellId }) => {
      const wizardSpells = listId("Wizard Spells");
      expect(thrownBy(() => lists.planAdd(wizardSpells, [spellId("Fireball")], 3))).toEqual(
        new RulesError("conflict", "Fireball is already on Wizard Spells"),
      );
      expect(thrownBy(() => lists.planAdd(listId("Cleric Spells"), [spellId("Bless")], 1))).toEqual(
        new RulesError("not-found", "Spell list not found for Wizard"),
      );
      expect(thrownBy(() => lists.planRemove(wizardSpells, spellId("Bless")))).toEqual(
        new RulesError("not-found", "Bless is not on Wizard Spells"),
      );
    });
  });
});
