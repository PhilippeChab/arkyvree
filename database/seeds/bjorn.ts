import { and, eq, isNull } from "drizzle-orm";
import {
  abilitiesInRules,
  aptitudesInRules,
  charactersInCharacter,
  characterAbilitiesInCharacter,
  featsInRules,
  inventoryInCharacter,
  itemsInRules,
  klassesInRules,
  klassLevelsInRules,
  languagesInCharacter,
  type location,
  languagesInRules,
  levelFeatsInCharacter,
  levelSkillsInCharacter,
  levelsInCharacter,
  rulesetsInRules,
  racesInRules,
  skillsInRules,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";
import { SEED_USER_ID } from "@/database/seeds/helpers.ts";

export default async function seed(db: Db) {
  // Get ruleset
  const [ruleset] = await db
    .select({ id: rulesetsInRules.id })
    .from(rulesetsInRules)
    .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));

  // Get race
  const [human] = await db
    .select({ id: racesInRules.id })
    .from(racesInRules)
    .where(and(eq(racesInRules.name, "Human"), eq(racesInRules.rulesetId, ruleset.id)));

  // Get fighter class
  const [fighter] = await db
    .select({ id: klassesInRules.id })
    .from(klassesInRules)
    .where(and(eq(klassesInRules.name, "Fighter"), eq(klassesInRules.rulesetId, ruleset.id)));

  // Create character
  const [character] = await db
    .insert(charactersInCharacter)
    .values({
      userId: SEED_USER_ID,
      rulesetId: ruleset.id,
      raceId: human.id,
      name: "Bjorn Ironhand",
      xp: 10000,
      alignment: "Lawful Good",
      age: 25,
      gender: "Male",
      height: "185",
      weight: "90",
      description: "Bjorn is a battle-hardened warrior from the northern tribes. His muscular frame and numerous scars tell of his experiences in combat. He carries his family's ancestral greataxe and wears a bear pelt over his armor.",
    })
    .returning({ id: charactersInCharacter.id });

  // Add ability scores
  const abilities = await db
    .select({ id: abilitiesInRules.id, name: abilitiesInRules.name })
    .from(abilitiesInRules)
    .where(
      and(
        eq(abilitiesInRules.rulesetId, ruleset.id),
        isNull(abilitiesInRules.deletedAt),
      ),
    );

  const abilityMap = Object.fromEntries(abilities.map((a) => [a.name, a.id]));
  const abilityScores: Record<string, number> = {
    Strength: 18, Dexterity: 14, Constitution: 16,
    Intelligence: 12, Wisdom: 10, Charisma: 8,
  };

  await db.insert(characterAbilitiesInCharacter).values(
    Object.entries(abilityScores).map(([name, score]) => ({
      characterId: character.id,
      abilityId: abilityMap[name],
      score,
    })),
  );

  // Add fighter levels 1-5
  const hpPerLevel = [10, 8, 7, 9, 6];
  const fighterLevelIds: string[] = [];

  for (let i = 1; i <= 5; i++) {
    const [klassLevel] = await db
      .select({ id: klassLevelsInRules.id })
      .from(klassLevelsInRules)
      .where(and(eq(klassLevelsInRules.klassId, fighter.id), eq(klassLevelsInRules.level, i)));

    const [charLevel] = await db
      .insert(levelsInCharacter)
      .values({ characterId: character.id, klassLevelId: klassLevel.id, hp: hpPerLevel[i - 1] })
      .returning({ id: levelsInCharacter.id });

    fighterLevelIds.push(charLevel.id);
  }

  // Add languages
  const langs = await db
    .select({ id: languagesInRules.id, name: languagesInRules.name })
    .from(languagesInRules)
    .where(eq(languagesInRules.rulesetId, ruleset.id));

  const langMap = Object.fromEntries(langs.map((l) => [l.name, l.id]));

  await db.insert(languagesInCharacter).values([
    { characterId: character.id, languageId: langMap["Common"] },
    { characterId: character.id, languageId: langMap["Dwarven"] },
  ]);

  // Get skill IDs
  const skillRows = await db
    .select({ id: skillsInRules.id, name: skillsInRules.name })
    .from(skillsInRules)
    .where(eq(skillsInRules.rulesetId, ruleset.id));

  const skillMap = Object.fromEntries(skillRows.map((s) => [s.name, s.id]));

  // Add skills per level — Human Fighter 5, INT 12 (+1 mod, +1 human): (2+1+1)*4 + (2+1+1)*4 = 32
  const levelSkills: { levelIndex: number; skillName: string; rank: number }[] = [
    // L1 (16 points)
    { levelIndex: 0, skillName: "Climb", rank: 4 },
    { levelIndex: 0, skillName: "Intimidate", rank: 4 },
    { levelIndex: 0, skillName: "Jump", rank: 4 },
    { levelIndex: 0, skillName: "Swim", rank: 4 },
    // L2 (4 points)
    { levelIndex: 1, skillName: "Climb", rank: 1 },
    { levelIndex: 1, skillName: "Jump", rank: 1 },
    { levelIndex: 1, skillName: "Swim", rank: 1 },
    { levelIndex: 1, skillName: "Handle Animal", rank: 1 },
    // L3 (4 points)
    { levelIndex: 2, skillName: "Climb", rank: 1 },
    { levelIndex: 2, skillName: "Intimidate", rank: 1 },
    { levelIndex: 2, skillName: "Swim", rank: 1 },
    { levelIndex: 2, skillName: "Handle Animal", rank: 1 },
    // L4 (4 points)
    { levelIndex: 3, skillName: "Jump", rank: 1 },
    { levelIndex: 3, skillName: "Swim", rank: 1 },
    { levelIndex: 3, skillName: "Handle Animal", rank: 1 },
    { levelIndex: 3, skillName: "Spot", rank: 1 },
    // L5 (4 points)
    { levelIndex: 4, skillName: "Intimidate", rank: 1 },
    { levelIndex: 4, skillName: "Climb", rank: 1 },
    { levelIndex: 4, skillName: "Handle Animal", rank: 1 },
    { levelIndex: 4, skillName: "Spot", rank: 1 },
  ];

  for (const ls of levelSkills) {
    await db.insert(levelSkillsInCharacter).values({
      characterLevelId: fighterLevelIds[ls.levelIndex],
      skillId: skillMap[ls.skillName],
      rank: ls.rank,
    });
  }

  // Add inventory
  const items = await db
    .select({ id: itemsInRules.id, name: itemsInRules.name })
    .from(itemsInRules)
    .where(eq(itemsInRules.rulesetId, ruleset.id));

  const itemMap = Object.fromEntries(items.map((i) => [i.name, i.id]));

  const inventoryItems: { name: string; quantity: number; equipped: boolean; location?: string; weaponSet?: number }[] = [
    { name: "Longsword", quantity: 1, equipped: true, location: "Main Hand", weaponSet: 0 },
    { name: "Chain Mail", quantity: 1, equipped: true, location: "Torso" },
    { name: "Heavy Steel Shield", quantity: 1, equipped: true, location: "Off Hand", weaponSet: 0 },
    { name: "Backpack (empty)", quantity: 1, equipped: true },
    { name: "Bedroll", quantity: 1, equipped: false },
    { name: "Rope, hempen (50 ft.)", quantity: 1, equipped: false },
    { name: "Rations, trail (per day)", quantity: 5, equipped: false },
    { name: "Waterskin", quantity: 2, equipped: false },
    { name: "Torch", quantity: 6, equipped: false },
    { name: "Flint and steel", quantity: 1, equipped: false },
  ];

  for (const inv of inventoryItems) {
    await db.insert(inventoryInCharacter).values({
      characterId: character.id,
      itemId: itemMap[inv.name],
      quantity: inv.quantity,
      equipped: inv.equipped,
      location: inv.location as typeof location.enumValues[number],
      weaponSet: inv.weaponSet,
    });
  }

  // Link feats to levels
  const feats = await db
    .select({ id: featsInRules.id, name: featsInRules.name })
    .from(featsInRules)
    .where(eq(featsInRules.rulesetId, ruleset.id));

  const featMap = Object.fromEntries(feats.map((f) => [f.name, f.id]));

  const aptitudes = await db
    .select({ id: aptitudesInRules.id, name: aptitudesInRules.name })
    .from(aptitudesInRules)
    .where(eq(aptitudesInRules.rulesetId, ruleset.id));

  const aptMap = Object.fromEntries(aptitudes.map((a) => [a.name, a.id]));

  await db.insert(levelFeatsInCharacter).values([
    // General feats (3 slots: floor(5/3) + 1 + 1 human bonus)
    { characterLevelId: fighterLevelIds[0], featId: featMap["Power Attack"], aptitudeId: aptMap["General"] },
    { characterLevelId: fighterLevelIds[0], featId: featMap["Great Fortitude"], aptitudeId: aptMap["General"] },
    { characterLevelId: fighterLevelIds[2], featId: featMap["Cleave"], aptitudeId: aptMap["General"] },
    // Fighter Bonus Feats (3 slots: levels 1, 2, 4)
    { characterLevelId: fighterLevelIds[0], featId: featMap["Weapon Focus: Longsword"], aptitudeId: aptMap["Fighter Bonus Feat"] },
    { characterLevelId: fighterLevelIds[1], featId: featMap["Dodge"], aptitudeId: aptMap["Fighter Bonus Feat"] },
    { characterLevelId: fighterLevelIds[3], featId: featMap["Weapon Specialization: Longsword"], aptitudeId: aptMap["Fighter Bonus Feat"] },
  ]);
}
