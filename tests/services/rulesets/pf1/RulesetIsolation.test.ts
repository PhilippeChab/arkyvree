import { describe, expect, test } from "bun:test";

import { Engine } from "@/engine/index.ts";
import FeatEntity from "@/engine/rulesets/pf1/entities/feats/FeatEntity.ts";
import DetailedCharacter from "@/engine/rulesets/pf1/model/DetailedCharacter.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import { buildCharacter, createPf1Character } from "@/tests/support/pf1/characters.ts";
import { addLevel } from "@/tests/support/pf1/levels.ts";
import { findOtherCoreRules, getPf1SeedCtx } from "@/tests/support/pf1/seed.ts";
import { readTargetPaths } from "@/tests/support/rulesets.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";
import { PF1_BASE_RULES } from "@/vocabulary/pf1/baseRules.ts";
import { CLASS_LEVEL_SKILL_RANKS } from "@/vocabulary/pf1/fields/index.ts";

const session = makeSession();

/** A ruleset's feats' kind, as the engine bound to its view hands it out. */
async function featsKindOf(rulesetId: string) {
  return await withRulesetScope(db, rulesetId, async (scope) => Engine.for(scope).entities("feats"));
}

/** The seed user's private fork of the seeded Pathfinder core rules, as the app forks one. */
async function forkCore() {
  const { rulesetId } = await getPf1SeedCtx();
  return await RulesetsService.forkRuleset(session, rulesetId, { name: `Fork ${uniqueId()}`, private: true });
}

/** The modifier target paths a ruleset's view lists, by path. */
async function modifierPathsOf(rulesetId: string) {
  return (await readTargetPaths(rulesetId, "modifier")).paths.map(({ path }) => path);
}

describe("A Pathfinder ruleset", () => {
  test("answers with Pathfinder's module: its feats are Pathfinder's kind, its paths and fields Pathfinder's", async () => {
    const { rulesetId } = await getPf1SeedCtx();
    const other = await findOtherCoreRules();
    expect((await featsKindOf(rulesetId)).constructor).toBe(FeatEntity);
    expect((await featsKindOf(other.ruleset.id)).constructor).not.toBe(FeatEntity);

    const pathfinder = await modifierPathsOf(rulesetId);
    const dnd35 = await modifierPathsOf(other.ruleset.id);
    expect(pathfinder).toEqual(
      expect.arrayContaining(["combat.cmb.misc", "combat.cmd.misc", "skills.perception.misc", "skills.stealth.misc"]),
    );
    expect(pathfinder.filter((path) => /^skills\.(hide|spot|listen|jump)\./.test(path))).toEqual([]);
    expect(dnd35.filter((path) => /^combat\.cm[bd]\.|^skills\.perception\./.test(path))).toEqual([]);

    // A class level holds skill ranks in Pathfinder, skill points in 3.5
    expect(Engine.forRules(PF1_BASE_RULES).storage().field("class-levels", CLASS_LEVEL_SKILL_RANKS)).toBeDefined();
    expect(
      Engine.forRules(other.ruleset.baseRules).storage().field("class-levels", CLASS_LEVEL_SKILL_RANKS),
    ).toBeUndefined();
  });

  test("refuses a 3.5 feat pool for its feat, naming it", async () => {
    const general = await (await findOtherCoreRules()).idOf("aptitudes", "General");
    const fork = await forkCore();
    expect(
      EntitiesService.createEntity(session, fork.id, "feats", {
        name: `Homebrew ${uniqueId()}`,
        links: { listedIn: [{ toId: general }] },
      }),
    ).rejects.toMatchObject({ refusal: "invalid", message: expect.stringContaining(general) });
  });

  test("refuses a 3.5 feat a Pathfinder character's level picks, forced or not, naming it", async () => {
    const powerAttack = await (await findOtherCoreRules()).idOf("feats", "Power Attack");
    const character = await createPf1Character(session, { abilities: { Strength: 15 } });
    for (const force of [false, true]) {
      const level = addLevel(session, character.id, "Fighter", 1, { hp: 10, feats: { General: [powerAttack] } }, force);
      expect(level).rejects.toMatchObject({
        refusal: "invalid",
        message: `Feat ${powerAttack} does not belong to the character's ruleset`,
      });
    }
  });

  test("forks into a Pathfinder ruleset, whose characters are Pathfinder characters", async () => {
    const { rulesetId } = await getPf1SeedCtx();
    const fork = await forkCore();
    expect(await Rulesets.findOne(db, { id: fork.id })).toMatchObject({ baseRules: PF1_BASE_RULES, rulesetId });
    expect((await featsKindOf(fork.id)).constructor).toBe(FeatEntity);

    const character = await createPf1Character(session, { rulesetId: fork.id, abilities: { Strength: 15 } });
    await addLevel(session, character.id, "Fighter", 1, { hp: 10 }, true);
    const built = await buildCharacter(character.id);
    expect(built).toBeInstanceOf(DetailedCharacter);
    // BAB 1 + Strength 15's +2
    expect(built.components.combat.getCombat().cmb.total).toBe(3);
  });
});
