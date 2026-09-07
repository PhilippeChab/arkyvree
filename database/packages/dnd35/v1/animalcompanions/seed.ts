import { and, eq } from "drizzle-orm";
import {
  abilitiesInRules,
  aptitudesInRules,
  featsInRules,
  klassesInRules,
  modifiersInCustomization,
  racesInRules,
  rulesetsInRules,
  savesInRules,
  skillsInRules,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";
import { seedClass } from "@/database/packages/dnd35/seed-utils.ts";
import { seedFeats } from "@/database/packages/dnd35/seed-utils/seed-feats.ts";
import {
  ANIMAL_COMPANION_APTITUDES,
  ANIMAL_COMPANION_CLASS,
  ANIMAL_COMPANION_CLASS_FEATURE_FEATS,
  ANIMAL_COMPANION_RACE_PICK_FEATS,
  ANIMAL_COMPANION_RACES,
  BONDED_RACE_FEATURE_FEATS,
} from "@/database/packages/dnd35/v1/animalcompanions/data.ts";

export default async function seed(db: Db) {
  const [ruleset] = await db
    .select({ id: rulesetsInRules.id })
    .from(rulesetsInRules)
    .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));
  if (!ruleset) throw new Error(`Ruleset "${DND35_RULESET_NAME}" not found`);

  // Same seed is called from v1 (fresh installs) and from v46 (prod upgrade
  // path). Skip if already applied.
  const existing = await db
    .select({ id: klassesInRules.id })
    .from(klassesInRules)
    .where(and(eq(klassesInRules.rulesetId, ruleset.id), eq(klassesInRules.kind, "animalcompanion")))
    .limit(1);
  if (existing.length > 0) return;

  await db.insert(aptitudesInRules).values(
    ANIMAL_COMPANION_APTITUDES.map((name) => ({ rulesetId: ruleset.id, name })),
  );

  const aptitudes = await db
    .select({ id: aptitudesInRules.id, name: aptitudesInRules.name })
    .from(aptitudesInRules)
    .where(eq(aptitudesInRules.rulesetId, ruleset.id));
  const aptMap = Object.fromEntries(aptitudes.map((a) => [a.name, a.id]));

  await seedFeats(db, ruleset.id, aptMap, ANIMAL_COMPANION_CLASS_FEATURE_FEATS);
  await seedFeats(db, ruleset.id, aptMap, ANIMAL_COMPANION_RACE_PICK_FEATS);
  await seedFeats(db, ruleset.id, aptMap, BONDED_RACE_FEATURE_FEATS);

  const insertedRaces = await db.insert(racesInRules).values(
    ANIMAL_COMPANION_RACES.map((r) => ({
      rulesetId: ruleset.id,
      name: r.name,
      description: r.description,
      size: r.size,
      baseSpeed: r.baseSpeed,
      kind: r.kind ?? "animalcompanion",
    })),
  ).returning({ id: racesInRules.id, name: racesInRules.name });
  const raceMap = Object.fromEntries(insertedRaces.map((r) => [r.name, r.id]));

  const raceModifiers: {
    sourceId: string;
    sourceType: string;
    target: string;
    operator: string;
    value: string;
    valueType: string;
  }[] = [];
  for (const race of ANIMAL_COMPANION_RACES) {
    if (!race.modifiers?.length) continue;
    for (const m of race.modifiers) {
      raceModifiers.push({ sourceId: raceMap[race.name], sourceType: "races", ...m });
    }
  }
  if (raceModifiers.length > 0) {
    await db.insert(modifiersInCustomization).values(raceModifiers);
  }

  const saves = await db
    .select({ id: savesInRules.id, name: savesInRules.name })
    .from(savesInRules)
    .where(eq(savesInRules.rulesetId, ruleset.id));
  const skills = await db
    .select({ id: skillsInRules.id, name: skillsInRules.name })
    .from(skillsInRules)
    .where(eq(skillsInRules.rulesetId, ruleset.id));
  const feats = await db
    .select({ id: featsInRules.id, name: featsInRules.name })
    .from(featsInRules)
    .where(eq(featsInRules.rulesetId, ruleset.id));
  const abilities = await db
    .select({ id: abilitiesInRules.id, name: abilitiesInRules.name })
    .from(abilitiesInRules)
    .where(eq(abilitiesInRules.rulesetId, ruleset.id));

  await seedClass(db, ruleset.id, ANIMAL_COMPANION_CLASS, {
    rulesetId: ruleset.id,
    saveMap: Object.fromEntries(saves.map((s) => [s.name, s.id])),
    skillMap: Object.fromEntries(skills.map((s) => [s.name, s.id])),
    featMap: Object.fromEntries(feats.map((f) => [f.name, f.id])),
    aptMap,
    abilityMap: Object.fromEntries(abilities.map((a) => [a.name, a.id])),
  });
}
