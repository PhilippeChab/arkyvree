import { db } from "@/server/database/index.ts";
import { Characters } from "@/server/repositories/index.ts";
import { addOneLevel } from "@/tests/helpers.ts";
import { createCharacter, getSeedContext, SEED_USER_ID, type SeedContext } from "@/database/seeds/helpers.ts";
import type { Session } from "@/shared/relations.ts";

export function makeSession(userId: string = SEED_USER_ID): Session {
  return {
    id: `session-${Math.random().toString(36).slice(2, 11)}`,
    userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export async function makeWizard(name: string, ctx: SeedContext): Promise<string> {
  return await createCharacter(db, ctx, {
    raceName: "Human", name, xp: 0,
    alignment: "Neutral Good", age: 25, gender: "Female",
    height: "170", weight: "60", description: "Test wizard",
    abilities: { Strength: 10, Dexterity: 14, Constitution: 14, Intelligence: 16, Wisdom: 12, Charisma: 10 },
    languages: ["Common"],
  });
}

export const wizardL1Skills = (ctx: SeedContext) => ({
  [ctx.skillMap["Spellcraft"]]: 4,
  [ctx.skillMap["Concentration"]]: 4,
  [ctx.skillMap["Knowledge (Arcana)"]]: 4,
  [ctx.skillMap["Knowledge (Religion)"]]: 4,
  [ctx.skillMap["Knowledge (Nature)"]]: 4,
  [ctx.skillMap["Decipher Script"]]: 4,
});

export const wizardL1Powers = (ctx: SeedContext) => ({
  [ctx.aptMap["Wizard Spells"]]: [
    ctx.powerMap["Detect Magic"], ctx.powerMap["Light"], ctx.powerMap["Read Magic"],
    ctx.powerMap["Mage Hand"], ctx.powerMap["Prestidigitation"], ctx.powerMap["Resistance"],
    ctx.powerMap["Magic Missile"], ctx.powerMap["Mage Armor"], ctx.powerMap["Shield"],
  ],
});

export function wizardL1Feats(ctx: SeedContext, familiarFeat: string | null) {
  return {
    [ctx.aptMap["General"]]: [ctx.featMap["Toughness"], ctx.featMap["Combat Casting"]],
    [ctx.aptMap["Wizard Specialization"]]: [ctx.featMap["Generalist"]],
    ...(familiarFeat ? { [ctx.aptMap["Familiar Bond"]]: [ctx.featMap[familiarFeat]] } : {}),
  };
}

/**
 * Spin up a Wizard 1 with the picked familiar race-feat already applied. The
 * familiar character row is materialized by reconcile during finalizeLevelUp.
 */
export async function makeWizardWithFamiliar(name: string, familiarFeat = "Cat Familiar") {
  const ctx = await getSeedContext(db);
  const masterId = await makeWizard(name, ctx);
  await addOneLevel(
    makeSession(), masterId, ctx.klassMap.pc["Wizard"], 1, 4, null,
    wizardL1Skills(ctx), wizardL1Feats(ctx, familiarFeat), wizardL1Powers(ctx),
  );
  const familiar = (await Characters.findOne(db, { parentCharacterId: masterId, kind: "familiar" }))!;
  return { ctx, masterId, familiarId: familiar.id };
}

export async function makeDruid(name: string, ctx: SeedContext): Promise<string> {
  return await createCharacter(db, ctx, {
    raceName: "Human", name, xp: 0,
    alignment: "True Neutral", age: 30, gender: "Female",
    height: "170", weight: "65", description: "Test druid",
    abilities: { Strength: 12, Dexterity: 12, Constitution: 14, Intelligence: 10, Wisdom: 16, Charisma: 10 },
    languages: ["Common", "Druidic"],
  });
}

export const druidL1Skills = (ctx: SeedContext) => ({
  [ctx.skillMap["Concentration"]]: 4,
  [ctx.skillMap["Knowledge (Nature)"]]: 4,
  [ctx.skillMap["Survival"]]: 4,
  [ctx.skillMap["Spellcraft"]]: 4,
  [ctx.skillMap["Handle Animal"]]: 4,
});

export function druidL1Feats(ctx: SeedContext, animalFeat: string | null) {
  return {
    [ctx.aptMap["General"]]: [ctx.featMap["Toughness"], ctx.featMap["Combat Casting"]],
    ...(animalFeat ? { [ctx.aptMap["Animal Companion Bond"]]: [ctx.featMap[animalFeat]] } : {}),
  };
}

/**
 * Spin up a Druid 1 with the picked animal companion race-feat already applied.
 */
export async function makeDruidWithAnimalCompanion(name: string, animalFeat = "Wolf Animal Companion") {
  const ctx = await getSeedContext(db);
  const masterId = await makeDruid(name, ctx);
  await addOneLevel(
    makeSession(), masterId, ctx.klassMap.pc["Druid"], 1, 8, null,
    druidL1Skills(ctx), druidL1Feats(ctx, animalFeat), {},
  );
  const companion = (await Characters.findOne(db, { parentCharacterId: masterId, kind: "animalcompanion" }))!;
  return { ctx, masterId, companionId: companion.id };
}

export async function makePaladin(name: string, ctx: SeedContext): Promise<string> {
  return await createCharacter(db, ctx, {
    raceName: "Human", name, xp: 0,
    alignment: "Lawful Good", age: 30, gender: "Male",
    height: "180", weight: "80", description: "Test paladin",
    abilities: { Strength: 16, Dexterity: 10, Constitution: 14, Intelligence: 10, Wisdom: 12, Charisma: 14 },
    languages: ["Common"],
  });
}

export const paladinL1Skills = (ctx: SeedContext) => ({
  [ctx.skillMap["Diplomacy"]]: 4,
  [ctx.skillMap["Knowledge (Religion)"]]: 4,
  [ctx.skillMap["Ride"]]: 4,
  [ctx.skillMap["Sense Motive"]]: 4,
});

export const paladinL1Feats = (ctx: SeedContext) => ({
  [ctx.aptMap["General"]]: [ctx.featMap["Toughness"], ctx.featMap["Power Attack"]],
});

/**
 * Spin up a Paladin 5 with the picked Special Mount race-feat already applied
 * at level 5 (when Special Mount unlocks). Levels 1-4 carry no extra picks.
 * Reconcile materializes the mount character row once the L5 feat resolves.
 */
export async function makePaladinWithMount(name: string, mountFeat = "Heavy Warhorse Special Mount") {
  const ctx = await getSeedContext(db);
  const masterId = await makePaladin(name, ctx);
  await addOneLevel(
    makeSession(), masterId, ctx.klassMap.pc["Paladin"], 1, 10, null,
    paladinL1Skills(ctx), paladinL1Feats(ctx), {},
  );
  for (let lv = 2; lv <= 4; lv++) {
    // Levels 1-3 don't need ability increase; level 4 does (every 4 levels).
    const abilityId = lv === 4 ? ctx.abilityMap["Strength"] : null;
    await addOneLevel(makeSession(), masterId, ctx.klassMap.pc["Paladin"], lv, 10, abilityId, {}, {}, {}, true);
  }
  await addOneLevel(
    makeSession(), masterId, ctx.klassMap.pc["Paladin"], 5, 10, null,
    {}, { [ctx.aptMap["Special Mount Bond"]]: [ctx.featMap[mountFeat]] }, {},
    true,
  );
  const mount = (await Characters.findOne(db, { parentCharacterId: masterId, kind: "mount" }))!;
  return { ctx, masterId, mountId: mount.id };
}
