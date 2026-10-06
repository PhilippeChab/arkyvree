import { expect, test } from "bun:test";

import { eq, inArray } from "drizzle-orm";

import seedCharacters, { CHARACTERS } from "@/database/seeds/characters.ts";
import { type CharacterSeed, SEED_USER_ID } from "@/database/seeds/helpers.ts";
import {
  characterAbilitiesInCharacter,
  charactersInCharacter,
  inventoryInCharacter,
  klassLevelsInRules,
  languagesInCharacter,
  levelFeatsInCharacter,
  levelPowersInCharacter,
  levelsInCharacter,
  levelSkillsInCharacter,
} from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import DetailedCharacter from "@/server/rulesets/dnd3.5/DetailedCharacter.ts";
import { namesOf } from "@/tests/seeds/freshSeed.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";

type Character = typeof charactersInCharacter.$inferSelect;

function inventoryLine(item: {
  name: string;
  quantity: number;
  equipped?: boolean;
  location?: string | null;
  weaponSet?: number | null;
}) {
  return `${item.name} x${item.quantity}${item.equipped ? ", equipped" : ""} in ${item.location ?? "—"} set ${item.weaponSet ?? "—"}`;
}

/**
 * What a character's seed says it has, on the ruleset characters are seeded on, as `written` reads it back: a level
 * is its class and level there.
 */
function seeded(
  { classes, skills, feats, powers = [], inventory, abilities, languages, ...identity }: CharacterSeed,
  rulesetId: string,
) {
  const levels = classes.flatMap(({ klass, hp }) => hp.map((_, i) => `${klass} ${i + 1}`));
  return {
    identity: {
      rulesetId,
      name: identity.name,
      race: identity.raceName,
      xp: identity.xp,
      alignment: identity.alignment,
      age: identity.age,
      gender: identity.gender,
      height: identity.height,
      weight: identity.weight,
      description: identity.description,
    },
    abilities,
    languages: [...languages].sort(),
    levels: classes.flatMap(({ klass, hp }) => hp.map((rolled, i) => `${klass} ${i + 1}: ${rolled} hp`)).sort(),
    skills: skills.map((s) => `${levels[s.levelIndex]}: ${s.skillName} ${s.rank}`).sort(),
    feats: feats.map((f) => `${levels[f.levelIndex]}: ${f.featName} in ${f.aptitude}`).sort(),
    powers: powers.map((p) => `${levels[p.levelIndex]}: ${p.powerName} in ${p.aptitude}`).sort(),
    inventory: inventory.map(inventoryLine).sort(),
  };
}

/** What the seed wrote of a character. */
async function written(character: Character) {
  const ctx = await getSeedCtx();
  const [races, klasses, abilities, languages, skills, feats, aptitudes, powers, items] = [
    ctx.raceMap.pc,
    ctx.klassMap.pc,
    ctx.abilityMap,
    ctx.langMap,
    ctx.skillMap,
    ctx.featMap,
    ctx.aptMap,
    ctx.powerMap,
    ctx.itemMap,
  ].map(namesOf);
  const levels = await db.select().from(levelsInCharacter).where(eq(levelsInCharacter.characterId, character.id));
  const klassLevels = await db
    .select()
    .from(klassLevelsInRules)
    .where(
      inArray(
        klassLevelsInRules.id,
        levels.map((level) => level.klassLevelId),
      ),
    );
  const levelNames = Object.fromEntries(
    levels.map((level) => {
      const klassLevel = klassLevels.find(({ id }) => id === level.klassLevelId)!;
      return [level.id, `${klasses[klassLevel.klassId]} ${klassLevel.level}`];
    }),
  );
  const levelIds = levels.map(({ id }) => id);
  return {
    identity: {
      rulesetId: character.rulesetId,
      name: character.name,
      race: races[character.raceId],
      xp: character.xp,
      alignment: character.alignment,
      age: character.age,
      gender: character.gender,
      height: character.height,
      weight: character.weight,
      description: character.description,
    },
    abilities: Object.fromEntries(
      (
        await db
          .select()
          .from(characterAbilitiesInCharacter)
          .where(eq(characterAbilitiesInCharacter.characterId, character.id))
      ).map((ability) => [abilities[ability.abilityId], ability.score]),
    ),
    languages: (await db.select().from(languagesInCharacter).where(eq(languagesInCharacter.characterId, character.id)))
      .map((language) => languages[language.languageId])
      .sort(),
    levels: levels.map((level) => `${levelNames[level.id]}: ${level.hp} hp`).sort(),
    skills: (
      await db.select().from(levelSkillsInCharacter).where(inArray(levelSkillsInCharacter.characterLevelId, levelIds))
    )
      .map((s) => `${levelNames[s.characterLevelId]}: ${skills[s.skillId]} ${s.rank}`)
      .sort(),
    feats: (
      await db.select().from(levelFeatsInCharacter).where(inArray(levelFeatsInCharacter.characterLevelId, levelIds))
    )
      .map((f) => `${levelNames[f.characterLevelId]}: ${feats[f.featId]} in ${aptitudes[f.aptitudeId]}`)
      .sort(),
    powers: (
      await db.select().from(levelPowersInCharacter).where(inArray(levelPowersInCharacter.characterLevelId, levelIds))
    )
      .map((p) => `${levelNames[p.characterLevelId]}: ${powers[p.powerId]} in ${aptitudes[p.aptitudeId]}`)
      .sort(),
    inventory: (await db.select().from(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id)))
      .map((item) => inventoryLine({ ...item, name: items[item.itemId] }))
      .sort(),
  };
}

test("The test data seeds the seed user's characters as written, each valid, with the creatures their feats bond them to", async () => {
  const before = new Set(
    (await db.select({ id: charactersInCharacter.id }).from(charactersInCharacter)).map(({ id }) => id),
  );
  await seedCharacters(db);
  const created = (
    await db.select().from(charactersInCharacter).where(eq(charactersInCharacter.userId, SEED_USER_ID))
  ).filter(({ id }) => !before.has(id));

  const masters = created.filter((character) => character.kind === "pc");
  expect(masters.map(({ name }) => name).sort()).toEqual(CHARACTERS.map(({ name }) => name).sort());
  const { rulesetId } = await getSeedCtx();
  for (const seed of CHARACTERS) {
    const character = masters.find(({ name }) => name === seed.name)!;
    expect(await written(character)).toEqual(seeded(seed, rulesetId));
    const detailed = new DetailedCharacter(character);
    await detailed.build();
    expect({ name: seed.name, validation: detailed.validate() }).toEqual({
      name: seed.name,
      validation: { valid: true, issues: [] },
    });
  }

  const bonded = created
    .filter((character) => character.kind !== "pc")
    .map(
      (creature) =>
        `${masters.find(({ id }) => id === creature.parentCharacterId)?.name}: ${creature.kind} ${creature.name}`,
    );
  expect(bonded.sort()).toEqual([
    "Aldric Dawnbringer: mount Heavy Warhorse",
    "Elara Starweaver: familiar Owl",
    "Rowan Thornwalker: animalcompanion Wolf",
    "Vex Flamecaller: familiar Cat",
  ]);
}, 30_000);
