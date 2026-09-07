import { and, eq, inArray } from "drizzle-orm";
import {
  aptitudesInRules,
  featsInRules,
  klassesInRules,
  klassLevelFeatsInRules,
  klassLevelsInRules,
  rulesetsInRules,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";
import { seedFeats } from "@/database/packages/dnd35/seed-utils/seed-feats.ts";
import {
  FAVORED_ENEMY_SPECIALIZATION_APTITUDE,
  FAVORED_ENEMY_SPECIALIZATION_UMBRELLA,
  favoredEnemySpecializationUmbrella,
  favoredEnemySpecializationVariants,
} from "@/database/packages/dnd35/v1/feats/creatureTypes.ts";

const RANGER_CLASS_FEATURE_APTITUDE = "Ranger Class Feature";
const SPECIALIZATION_GRANT_LEVELS = [5, 10, 15, 20];

export async function seedFavoredEnemySpecialization(db: Db) {
  const [ruleset] = await db
    .select({ id: rulesetsInRules.id })
    .from(rulesetsInRules)
    .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));
  if (!ruleset) throw new Error(`Ruleset "${DND35_RULESET_NAME}" not found`);

  const existingApts = await db
    .select({ id: aptitudesInRules.id, name: aptitudesInRules.name })
    .from(aptitudesInRules)
    .where(eq(aptitudesInRules.rulesetId, ruleset.id));
  const aptByName = new Map(existingApts.map((a) => [a.name, a.id]));

  if (!aptByName.has(FAVORED_ENEMY_SPECIALIZATION_APTITUDE)) {
    await db
      .insert(aptitudesInRules)
      .values({ rulesetId: ruleset.id, name: FAVORED_ENEMY_SPECIALIZATION_APTITUDE });
  }

  // Re-read to include the new aptitude row.
  const aptitudes = await db
    .select({ id: aptitudesInRules.id, name: aptitudesInRules.name })
    .from(aptitudesInRules)
    .where(eq(aptitudesInRules.rulesetId, ruleset.id));
  const aptMap = Object.fromEntries(aptitudes.map((a) => [a.name, a.id]));

  const existingFeats = await db
    .select({ name: featsInRules.name })
    .from(featsInRules)
    .where(eq(featsInRules.rulesetId, ruleset.id));
  const existingNames = new Set(existingFeats.map((f) => f.name));

  const newVariants = favoredEnemySpecializationVariants.filter((v) => !existingNames.has(v.name));
  if (newVariants.length > 0) {
    await seedFeats(db, ruleset.id, aptMap, newVariants);
  }

  if (!existingNames.has(FAVORED_ENEMY_SPECIALIZATION_UMBRELLA)) {
    await seedFeats(db, ruleset.id, aptMap, [favoredEnemySpecializationUmbrella]);
  }

  const [umbrella] = await db
    .select({ id: featsInRules.id })
    .from(featsInRules)
    .where(and(
      eq(featsInRules.rulesetId, ruleset.id),
      eq(featsInRules.name, FAVORED_ENEMY_SPECIALIZATION_UMBRELLA),
    ));
  if (!umbrella) return;

  const [ranger] = await db
    .select({ id: klassesInRules.id })
    .from(klassesInRules)
    .where(and(eq(klassesInRules.rulesetId, ruleset.id), eq(klassesInRules.name, "Ranger")));
  if (!ranger) return;

  const grantLevels = await db
    .select({ id: klassLevelsInRules.id, level: klassLevelsInRules.level })
    .from(klassLevelsInRules)
    .where(and(
      eq(klassLevelsInRules.klassId, ranger.id),
      inArray(klassLevelsInRules.level, SPECIALIZATION_GRANT_LEVELS),
    ));

  const existingGrants = await db
    .select({ klassLevelId: klassLevelFeatsInRules.klassLevelId })
    .from(klassLevelFeatsInRules)
    .where(and(
      eq(klassLevelFeatsInRules.featId, umbrella.id),
      inArray(klassLevelFeatsInRules.klassLevelId, grantLevels.map((g) => g.id)),
    ));
  const grantedIds = new Set(existingGrants.map((g) => g.klassLevelId));

  const rangerClassFeatureAptId = aptMap[RANGER_CLASS_FEATURE_APTITUDE];
  if (!rangerClassFeatureAptId) throw new Error(`Aptitude "${RANGER_CLASS_FEATURE_APTITUDE}" not found`);
  const newGrants = grantLevels
    .filter((g) => !grantedIds.has(g.id))
    .map((g) => ({
      klassLevelId: g.id,
      featId: umbrella.id,
      aptitudeId: rangerClassFeatureAptId,
      free: true,
    }));
  if (newGrants.length > 0) {
    await db.insert(klassLevelFeatsInRules).values(newGrants);
  }
}
