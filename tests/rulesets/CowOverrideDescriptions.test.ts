import { describe, expect, test } from "bun:test";

import { addClassLevels, addFeats, addPowers, addSkills } from "@/database/seeds/seedCharacter.ts";
import { db } from "@/server/database/index.ts";
import { Characters, Saves, Skills } from "@/server/repositories/index.ts";
import DetailedCharacter from "@/server/rulesets/dnd3.5/character/DetailedCharacter.ts";
import { FeatsService } from "@/server/services/rulesets/feats/index.ts";
import { PowersService } from "@/server/services/rulesets/powers/index.ts";
import { SkillsService } from "@/server/services/rulesets/skills/index.ts";
import { buildAs } from "@/tests/support/characters.ts";
import { createSeedCharacter } from "@/tests/support/levelFixtures.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";

// A level picks the inherited feat, spell or skill by its id: the sheet must show the fork's copy of it all the same.
describe("A fork's own description of an inherited", () => {
  test.each([
    ["feat", "fighter", "Fighter", 10] as const,
    ["spell", "wizard", "Wizard", 4] as const,
    ["skill", "fighter", "Fighter", 10] as const,
  ])("%s is on the sheet", async (kind, build, klass, hp) => {
    const session = makeSession();
    const fork = await createSeededTestRuleset(session.userId);
    const ctx = await getSeedCtx();
    const forkCtx = { ...ctx, rulesetId: fork.id };
    const description = `Overridden in the fork ${fork.id}`;
    const name = { feat: "Toughness", spell: "Magic Missile", skill: "Climb" }[kind];
    if (kind === "feat") {
      await FeatsService.updateFeat(session, fork.id, ctx.featMap[name], { name, description });
    } else if (kind === "spell") {
      await PowersService.updatePower(session, fork.id, ctx.powerMap[name], { name, description });
    } else {
      const skill = (await Skills.findOne(db, { id: ctx.skillMap[name] }))!;
      await SkillsService.updateSkill(session, fork.id, skill.id, {
        name,
        description,
        primaryAbilityId: skill.primaryAbilityId,
        checkPenaltyMultiplier: 1,
        impactedByWeight: true,
        usableWithoutTraining: true,
      });
    }

    const characterId = await createSeedCharacter(ctx, build, { rulesetId: fork.id });
    const levelIds = await addClassLevels(db, forkCtx, characterId, klass, [1], [hp]);
    if (kind === "feat")
      await addFeats(db, forkCtx, levelIds, [{ levelIndex: 0, featName: name, aptitude: "General" }]);
    else if (kind === "spell")
      await addPowers(db, forkCtx, levelIds, [{ levelIndex: 0, powerName: name, aptitude: "Wizard Spells" }]);
    else await addSkills(db, forkCtx, levelIds, [{ levelIndex: 0, skillName: name, rank: 4 }]);

    const character = await buildAs(DetailedCharacter, (await Characters.findOne(db, { id: characterId }))!);
    const levels = Object.values(character.components.classes.getCharacterClasses()).flatMap((k) => k.levels);
    const descriptions = new Map(
      levels
        .flatMap((level) => [...level.feats, ...level.powers, ...level.skills])
        .map((entity) => [entity.name, entity.description]),
    );
    expect(descriptions.get(name)).toBe(description);
  });
});

// A spell's saving throw is the fork's too: its save and what a success does
test("A fork's own saving throw of an inherited spell is on the sheet", async () => {
  const session = makeSession();
  const fork = await createSeededTestRuleset(session.userId);
  const ctx = await getSeedCtx();
  const forkCtx = { ...ctx, rulesetId: fork.id };
  const will = (await Saves.findOne(db, { name: "Will", rulesetId: ctx.rulesetId }))!;
  const name = "Magic Missile";
  await PowersService.updatePower(session, fork.id, ctx.powerMap[name], {
    name,
    saveId: will.id,
    saveEffect: "negates",
  });

  const characterId = await createSeedCharacter(ctx, "wizard", { rulesetId: fork.id });
  const levelIds = await addClassLevels(db, forkCtx, characterId, "Wizard", [1], [4]);
  await addPowers(db, forkCtx, levelIds, [{ levelIndex: 0, powerName: name, aptitude: "Wizard Spells" }]);

  const character = await buildAs(DetailedCharacter, (await Characters.findOne(db, { id: characterId }))!);
  const power = Object.values(character.components.classes.getCharacterClasses())
    .flatMap((k) => k.levels)
    .flatMap((level) => level.powers)
    .find((p) => p.name === name);
  expect(power).toMatchObject({ saveName: "Will", saveEffect: "negates" });
});
