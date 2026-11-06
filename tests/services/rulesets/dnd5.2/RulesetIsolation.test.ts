import { describe, expect, test } from "bun:test";

import { and, eq } from "drizzle-orm";

import { entitiesInRules } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import FeatEntity from "@/engine/rulesets/dnd5.2/entities/feats/FeatEntity.ts";
import DetailedCharacter from "@/engine/rulesets/dnd5.2/model/DetailedCharacter.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import { buildCharacter, createDnd52Character } from "@/tests/support/dnd5.2/characters.ts";
import { addLevel } from "@/tests/support/dnd5.2/levels.ts";
import { findOtherCoreRulesets, getDnd52SeedCtx } from "@/tests/support/dnd5.2/seed.ts";
import { readTargetPaths } from "@/tests/support/rulesets.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";
import { DND52_BASE_RULES } from "@/vocabulary/dnd5.2/baseRules.ts";

const session = makeSession();

/** A ruleset's feats' kind, as the engine bound to its view hands it out. */
async function featsKindOf(rulesetId: string) {
  return await withRulesetScope(db, rulesetId, async (scope) => Engine.for(scope).entities("feats"));
}

/** The seed user's private fork of the seeded D&D 5th Edition core rules, as the app forks one. */
async function forkCore() {
  const { rulesetId } = await getDnd52SeedCtx();
  return await RulesetsService.forkRuleset(session, rulesetId, { name: `Fork ${uniqueId()}`, private: true });
}

/** The id of an entity of another base rules' core rules (`rulesetId`), of a kind, by name. */
async function idIn(rulesetId: string, type: string, name: string) {
  const [row] = await db
    .select({ id: entitiesInRules.id })
    .from(entitiesInRules)
    .where(
      and(eq(entitiesInRules.rulesetId, rulesetId), eq(entitiesInRules.type, type), eq(entitiesInRules.name, name)),
    );
  if (!row) throw new Error(`No ${type} ${name} in ${rulesetId}`);
  return row.id;
}

/** The modifier target paths a ruleset's view lists, by path. */
async function modifierPathsOf(rulesetId: string) {
  return (await readTargetPaths(rulesetId, "modifier")).paths.map(({ path }) => path);
}

describe("A D&D 5th Edition ruleset", () => {
  test("answers with its own module: its feats its own kind, its paths its own, 3.5's and Pathfinder's theirs", async () => {
    const { rulesetId } = await getDnd52SeedCtx();
    expect((await featsKindOf(rulesetId)).constructor).toBe(FeatEntity);
    const own = await modifierPathsOf(rulesetId);
    expect(own).toEqual(
      expect.arrayContaining([
        "skills.stealth.expertise",
        "saves.strength.proficient",
        "combat.attacks",
        "items.weapons.longsword.mastered",
      ]),
    );
    expect(own.filter((path) => /^combat\.(bab|cmb)\b|^skills\.(hide|spot)\./.test(path))).toEqual([]);

    const others = await findOtherCoreRulesets();
    expect(others).toHaveLength(2);
    for (const other of others) {
      expect((await featsKindOf(other.id)).constructor).not.toBe(FeatEntity);
      expect((await modifierPathsOf(other.id)).filter((path) => /\.expertise$|\.mastered$/.test(path))).toEqual([]);
      // Another base rules' ruleset has no species: its own module refuses the kind as not found
      await withRulesetScope(db, other.id, async (scope) => {
        expect(() => Engine.for(scope).entities("species")).toThrow(expect.objectContaining({ refusal: "not-found" }));
      });
    }
  });

  test("refuses another base rules' feat pool for its feat, naming it", async () => {
    const [other] = await findOtherCoreRulesets();
    const general = await idIn(other.id, "aptitudes", "General");
    const fork = await forkCore();
    expect(
      EntitiesService.createEntity(session, fork.id, "feats", {
        name: `Homebrew ${uniqueId()}`,
        links: { listedIn: [{ toId: general }] },
      }),
    ).rejects.toMatchObject({ refusal: "invalid", message: expect.stringContaining(general) });
  });

  test("refuses another base rules' feat a character's level picks, forced or not, naming it", async () => {
    const others = await findOtherCoreRulesets();
    const dnd35 = others.find(({ baseRules }) => baseRules === "Dungeons & Dragons: 3.5")!;
    const powerAttack = await idIn(dnd35.id, "feats", "Power Attack");
    const character = await createDnd52Character(session, { abilities: { Strength: 15 } });
    for (const force of [false, true]) {
      const level = addLevel(session, character.id, "Fighter", 1, { hp: 10, feats: { General: [powerAttack] } }, force);
      expect(level).rejects.toMatchObject({
        refusal: "invalid",
        message: `Feat ${powerAttack} does not belong to the character's ruleset`,
      });
    }
  });

  test("forks into a D&D 5th Edition ruleset, whose characters are its characters", async () => {
    const { rulesetId } = await getDnd52SeedCtx();
    const fork = await forkCore();
    expect(await Rulesets.findOne(db, { id: fork.id })).toMatchObject({ baseRules: DND52_BASE_RULES, rulesetId });
    expect((await featsKindOf(fork.id)).constructor).toBe(FeatEntity);

    const character = await createDnd52Character(session, { rulesetId: fork.id, abilities: { Strength: 15 } });
    await addLevel(session, character.id, "Fighter", 1, { hp: 10 }, true);
    const built = await buildCharacter(character.id);
    expect(built).toBeInstanceOf(DetailedCharacter);
    // Strength 15's +2 and the Proficiency Bonus: a fighter's Strength saving throw
    expect(built.components.saves.getSave("strength").total).toBe(2 + 2);
  });
});
