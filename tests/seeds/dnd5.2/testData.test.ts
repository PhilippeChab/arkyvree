import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import type { CharacterSeed, InventorySeed } from "@/content/dnd5.2/builders/characters/types.ts";
import { CHARACTERS } from "@/content/dnd5.2/testData/characters.ts";
import { createCharacter, seedCharacter } from "@/database/seeders/dnd5.2/characters/seedCharacter.ts";
import { getSeedContext, type SeedContext } from "@/database/seeders/dnd5.2/characters/seedContext.ts";
import { seedTestCharacters } from "@/database/seeders/dnd5.2/characters/seedTestCharacters.ts";
import { charactersInCharacter } from "@/drizzle/schema.ts";
import type { KlassLevel } from "@/engine/rulesets/dnd5.2/index.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import {
  CharacterAdvancements,
  CharacterInventory,
  CharacterLinks,
  Characters,
  Entities,
  Visibility,
} from "@/server/repositories/index.ts";
import type { Character } from "@/shared/relations.ts";
import { buildCharacter } from "@/tests/support/dnd5.2/characters.ts";
import { findPicks } from "@/tests/support/dnd5.2/levels.ts";
import { DND52_BASE_RULES } from "@/vocabulary/dnd5.2/baseRules.ts";

function inventoryLine(item: Pick<InventorySeed, "groups" | "name" | "quantity"> & { location?: string | null }) {
  return `${item.name} x${item.quantity} in ${item.location ?? "—"} set ${item.groups?.join(", ") || "—"}`;
}

/** Names by id, of a map of ids by name. */
function namesOf(ids: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(ids).map(([name, id]) => [id, name]));
}

/**
 * What a character's seed says it has, on the ruleset characters are seeded on, as `written` reads it back: a level is
 * its class and level there.
 */
function seeded(
  { classes, feats, spells = [], inventory, abilities, languages, ...identity }: CharacterSeed,
  rulesetId: string,
) {
  const levels = classes.flatMap(({ klass, hp }) => hp.map((_, i) => `${klass} ${i + 1}`));
  return {
    identity: {
      rulesetId,
      name: identity.name,
      species: identity.links.species,
      background: identity.links.background,
      fields: { ...identity.fields },
      description: identity.description,
    },
    abilities,
    languages: [...languages].sort(),
    levels: classes.flatMap(({ klass, hp }) => hp.map((rolled, i) => `${klass} ${i + 1}: ${rolled} hp`)).sort(),
    feats: feats.map((f) => `${levels[f.levelIndex]}: ${f.featName} in ${f.aptitude}`).sort(),
    spells: spells.map((p) => `${levels[p.levelIndex]}: ${p.spellName} in ${p.aptitude}`).sort(),
    inventory: inventory.map(inventoryLine).sort(),
  };
}

/** The seed user's characters `seed` created: those it has now that it didn't have before. */
async function seedCreating(seed: () => Promise<void>) {
  const ownIds = async () =>
    (
      await db
        .select({ id: charactersInCharacter.id })
        .from(charactersInCharacter)
        .where(eq(charactersInCharacter.userId, SEED_USER_ID))
    ).map(({ id }) => id);
  const before = new Set(await ownIds());
  await seed();
  const created = (await ownIds()).filter((id) => !before.has(id));
  return await Characters.findMany(db, { ids: created }, Visibility.All);
}

/** What the seed wrote of a character, on the seeded core rules (`ctx`). */
async function written(ctx: SeedContext, character: Character) {
  const [species, backgrounds, classes, abilities, languages, feats, aptitudes, spells, items] = [
    ctx.speciesMap,
    ctx.backgroundMap,
    ctx.classMap,
    ctx.abilityMap,
    ctx.langMap,
    ctx.featMap,
    ctx.aptMap,
    ctx.spellMap,
    ctx.itemMap,
  ].map(namesOf);
  const levels = await CharacterAdvancements.findMany(db, { characterId: character.id });
  const levelNames: Record<string, string> = {};
  for (const level of levels) {
    const classLevel = (await Entities.findOne<KlassLevel>(db, { entityType: "class-levels", id: level.entryId }))!;
    levelNames[level.id] = `${classes[classLevel.ownerId]} ${classLevel.position}`;
  }
  const levelIds = levels.map(({ id }) => id);
  const links = await CharacterLinks.findPerRole(db, DND52_BASE_RULES, { characterId: character.id });
  return {
    identity: {
      rulesetId: character.rulesetId,
      name: character.name,
      species: species[character.links.species],
      background: backgrounds[character.links.background],
      fields: character.fields as Readonly<Record<string, unknown>>,
      description: character.description,
    },
    abilities: Object.fromEntries(links.score.map((ability) => [abilities[ability.entityId], ability.amount])),
    languages: links.speaks.map((language) => languages[language.entityId]).sort(),
    levels: (await findPicks("hp", levelIds)).map((hp) => `${levelNames[hp.advancementId]}: ${hp.amount} hp`).sort(),
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

describe("The D&D 5th Edition test data", () => {
  test("seeds the seed user's characters as written, each valid", async () => {
    const ctx = await getSeedContext(db);
    const created = await seedCreating(() => seedTestCharacters(db));

    expect(created.map(({ name }) => name).sort()).toEqual(CHARACTERS.map(({ name }) => name).sort());
    for (const seed of CHARACTERS) {
      const character = created.find(({ name }) => name === seed.name)!;
      expect(await written(ctx, character)).toEqual(seeded(seed, ctx.rulesetId));
      const built = await buildCharacter(character.id);
      expect({ name: seed.name, validation: built.validate() }).toEqual({
        name: seed.name,
        validation: { valid: true, issues: [] },
      });
    }
  }, 60_000);

  test("refuses a level that leaves a pool's picks unmade, naming the character and the level", async () => {
    const ctx = await getSeedContext(db);
    const [seed] = CHARACTERS;
    // A fighter's first level without its Fighting Style
    const unmade = {
      ...seed,
      feats: seed.feats.filter(({ aptitude }) => aptitude !== "Fighting Style"),
      inventory: [],
    };
    expect(seedCharacter(db, ctx, unmade)).rejects.toThrow(
      new RegExp(`^${seed.name}, level 1 \\(Fighter\\): .*Fighting Style: 1 pick left \\(0 of 1\\)`),
    );
  });

  test("refuses a multiclass without 13 in its new class's primary ability, naming the level", async () => {
    const ctx = await getSeedContext(db);
    const seed = CHARACTERS.find(({ name }) => name === "Thordin Ashbeard")!;
    // A wizard's first level asks for 13 Intelligence: Thordin has 8
    const refused = { ...seed, classes: [...seed.classes.slice(0, 1), { klass: "Wizard", hp: [4] }], inventory: [] };
    expect(
      seedCharacter(db, ctx, { ...refused, feats: seed.feats.filter(({ levelIndex }) => levelIndex < 3) }),
    ).rejects.toThrow(new RegExp(`^${seed.name}, level 4 \\(Wizard\\): .*Wizard`));
  });

  test("refuses a character's seed naming a species the ruleset doesn't seed", async () => {
    const ctx = await getSeedContext(db);
    const [{ name, description, fields }] = CHARACTERS;
    expect(
      createCharacter(db, ctx, {
        name,
        description,
        fields,
        abilities: {},
        languages: [],
        links: { species: "Test Nothing", background: "Soldier" },
      }),
    ).rejects.toThrow(`${name}'s species: "Test Nothing" isn't seeded`);
  });
});
