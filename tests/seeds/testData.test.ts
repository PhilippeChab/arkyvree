import { expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import type { CharacterSeed } from "@/content/core/builders/characters/types.ts";
import { CHARACTERS } from "@/content/dnd3.5/testData/characters.ts";
import { charactersInCharacter } from "@/drizzle/schema.ts";
import DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import seedCharacters from "@/scripts/db/seeds/characters.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import {
  CharacterAbilities,
  CharacterInventory,
  CharacterLanguages,
  CharacterLevelFeats,
  CharacterLevelPowers,
  CharacterLevels,
  CharacterLevelSkills,
  Characters,
  KlassLevels,
  Visibility,
} from "@/server/repositories/index.ts";
import type { Character } from "@/shared/relations.ts";
import { buildAs } from "@/tests/support/dnd3.5/characters.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";

import { namesOf } from "./freshSeed.ts";

function inventoryLine(item: {
  equipped?: boolean;
  location?: string | null;
  name: string;
  quantity: number;
  weaponSets?: number[];
}) {
  return `${item.name} x${item.quantity}${item.equipped ? ", equipped" : ""} in ${item.location ?? "—"} set ${item.weaponSets?.join(", ") || "—"}`;
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
  const levels = await CharacterLevels.findMany(db, { characterId: character.id });
  const levelNames: Record<string, string> = {};
  for (const level of levels) {
    const klassLevel = (await KlassLevels.findOne(db, { id: level.klassLevelId }))!;
    levelNames[level.id] = `${klasses[klassLevel.klassId]} ${klassLevel.level}`;
  }
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
      (await CharacterAbilities.findMany(db, { characterId: character.id })).map((ability) => [
        abilities[ability.abilityId],
        ability.score,
      ]),
    ),
    languages: (await CharacterLanguages.findMany(db, { characterId: character.id }))
      .map((language) => languages[language.languageId])
      .sort(),
    levels: levels.map((level) => `${levelNames[level.id]}: ${level.hp} hp`).sort(),
    skills: (await CharacterLevelSkills.findMany(db, { characterLevelIds: levelIds }))
      .map((s) => `${levelNames[s.characterLevelId]}: ${skills[s.skillId]} ${s.rank}`)
      .sort(),
    feats: (await CharacterLevelFeats.findMany(db, { characterLevelIds: levelIds }))
      .map((f) => `${levelNames[f.characterLevelId]}: ${feats[f.featId]} in ${aptitudes[f.aptitudeId]}`)
      .sort(),
    powers: (await CharacterLevelPowers.findMany(db, { characterLevelIds: levelIds }))
      .map((p) => `${levelNames[p.characterLevelId]}: ${powers[p.powerId]} in ${aptitudes[p.aptitudeId]}`)
      .sort(),
    inventory: (await CharacterInventory.findMany(db, { characterId: character.id }))
      .map((item) => inventoryLine({ ...item, name: items[item.itemId] }))
      .sort(),
  };
}

test("The test data seeds the seed user's characters as written, each valid, with the creatures their feats bond them to", async () => {
  const before = new Set(
    (await db.select({ id: charactersInCharacter.id }).from(charactersInCharacter)).map(({ id }) => id),
  );
  await seedCharacters(db);
  const ids = (
    await db
      .select({ id: charactersInCharacter.id })
      .from(charactersInCharacter)
      .where(eq(charactersInCharacter.userId, SEED_USER_ID))
  ).map(({ id }) => id);
  const created = await Characters.findMany(db, { ids: ids.filter((id) => !before.has(id)) }, Visibility.All);

  const masters = created.filter((character) => character.kind === "pc");
  expect(masters.map(({ name }) => name).sort()).toEqual(CHARACTERS.map(({ name }) => name).sort());
  const { rulesetId } = await getSeedCtx();
  for (const seed of CHARACTERS) {
    const character = masters.find(({ name }) => name === seed.name)!;
    expect(await written(character)).toEqual(seeded(seed, rulesetId));
    const detailed = await buildAs(DetailedCharacter, character);
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
