import { expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import type { CharacterSeed } from "@/content/dnd3.5/builders/characters/types.ts";
import { CHARACTERS } from "@/content/dnd3.5/testData/characters.ts";
import { createCharacter } from "@/database/seeders/dnd3.5/characters/seedCharacter.ts";
import { charactersInCharacter } from "@/drizzle/schema.ts";
import type { KlassLevel } from "@/engine/rulesets/dnd3.5/index.ts";
import DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import seedCharacters from "@/scripts/db/seeds/characters.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import {
  CharacterAdvancements,
  CharacterInventory,
  Characters,
  Entities,
  Visibility,
} from "@/server/repositories/index.ts";
import type { Character } from "@/shared/relations.ts";
import { findLinks } from "@/tests/support/characters.ts";
import { buildAs } from "@/tests/support/dnd3.5/characters.ts";
import { findPicks } from "@/tests/support/dnd3.5/levels.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";

import { namesOf } from "./freshSeed.ts";

function inventoryLine(item: {
  equipped?: boolean;
  groups?: number[];
  location?: string | null;
  name: string;
  quantity: number;
}) {
  return `${item.name} x${item.quantity}${item.equipped ? ", equipped" : ""} in ${item.location ?? "—"} set ${item.groups?.join(", ") || "—"}`;
}

/**
 * What a character's seed says it has, on the ruleset characters are seeded on, as `written` reads it back: a level
 * is its class and level there.
 */
function seeded(
  { classes, skills, feats, spells = [], inventory, abilities, languages, ...identity }: CharacterSeed,
  rulesetId: string,
) {
  const levels = classes.flatMap(({ klass, hp }) => hp.map((_, i) => `${klass} ${i + 1}`));
  return {
    identity: {
      rulesetId,
      name: identity.name,
      race: identity.links.race,
      fields: { ...identity.fields },
      description: identity.description,
    },
    abilities,
    languages: [...languages].sort(),
    levels: classes.flatMap(({ klass, hp }) => hp.map((rolled, i) => `${klass} ${i + 1}: ${rolled} hp`)).sort(),
    skills: skills.map((s) => `${levels[s.levelIndex]}: ${s.skillName} ${s.rank}`).sort(),
    feats: feats.map((f) => `${levels[f.levelIndex]}: ${f.featName} in ${f.aptitude}`).sort(),
    spells: spells.map((p) => `${levels[p.levelIndex]}: ${p.spellName} in ${p.aptitude}`).sort(),
    inventory: inventory.map(inventoryLine).sort(),
  };
}

/** What the seed wrote of a character. */
async function written(character: Character) {
  const ctx = await getSeedCtx();
  const [races, classes, abilities, languages, skills, feats, aptitudes, spells, items] = [
    ctx.raceMap.pc,
    ctx.classMap.pc,
    ctx.abilityMap,
    ctx.langMap,
    ctx.skillMap,
    ctx.featMap,
    ctx.aptMap,
    ctx.spellMap,
    ctx.itemMap,
  ].map(namesOf);
  const levels = await CharacterAdvancements.findMany(db, { characterId: character.id });
  const levelNames: Record<string, string> = {};
  for (const level of levels) {
    const classLevel = (await Entities.findOne<KlassLevel>(db, {
      entityType: "class-levels",
      id: level.entryId!,
    }))!;
    levelNames[level.id] = `${classes[classLevel.ownerId]} ${classLevel.position}`;
  }
  const levelIds = levels.map(({ id }) => id);
  return {
    identity: {
      rulesetId: character.rulesetId,
      name: character.name,
      race: races[character.links.race],
      fields: character.fields as Readonly<Record<string, unknown>>,
      description: character.description,
    },
    abilities: Object.fromEntries(
      (await findLinks("score", character.id)).map((ability) => [abilities[ability.entityId], ability.amount]),
    ),
    languages: (await findLinks("speaks", character.id)).map((language) => languages[language.entityId]).sort(),
    levels: (await findPicks("hp", levelIds)).map((hp) => `${levelNames[hp.advancementId]}: ${hp.amount} hp`).sort(),
    skills: (await findPicks("skills", levelIds))
      .map((s) => `${levelNames[s.advancementId]}: ${skills[s.entityId!]} ${s.amount}`)
      .sort(),
    feats: (await findPicks("feats", levelIds))
      .map((f) => `${levelNames[f.advancementId]}: ${feats[f.entityId!]} in ${aptitudes[f.viaId!]}`)
      .sort(),
    spells: (await findPicks("spells", levelIds))
      .map((p) => `${levelNames[p.advancementId]}: ${spells[p.entityId!]} in ${aptitudes[p.viaId!]}`)
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

test("A character's seed naming a race the ruleset doesn't seed is refused", async () => {
  const ctx = await getSeedCtx();
  const [{ name, description, fields }] = CHARACTERS;
  expect(
    createCharacter(db, ctx, {
      name,
      description,
      fields,
      abilities: {},
      languages: [],
      links: { race: "Test Nothing" },
    }),
  ).rejects.toThrow(`${name}'s race: "Test Nothing" isn't seeded`);
});
