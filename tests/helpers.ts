import { eq } from "drizzle-orm";
import { rulesetsInRules } from "@/drizzle/schema.ts";
import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";
import { db } from "@/server/database/index.ts";
import { Properties, Rulesets } from "@/server/repositories/index.ts";
import { CharacterLevelsMethods } from "@/server/services/characters/CharacterLevelsService.ts";
import type { Session } from "@/shared/relations.ts";

/**
 * Creates a test ruleset by forking the seeded D&D 3.5 base ruleset.
 * The fork inherits all entities (abilities, saves, skills, feats, etc.)
 * via COW without duplicating any data.
 */
export async function createSeededTestRuleset(
  userId: string,
  options: {
    name?: string;
    description?: string;
    private?: boolean;
    status?: "Draft" | "Published" | "Archived";
  } = {},
) {
  const uniqueId = Math.random().toString(36).substr(2, 9);

  const [seedRuleset] = await db
    .select({ id: rulesetsInRules.id })
    .from(rulesetsInRules)
    .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));

  const rulesets = await Rulesets.create(db, {
    name: options.name ?? `Test Ruleset ${uniqueId}`,
    description: options.description ?? "Test ruleset description",
    private: options.private ?? true,
    baseRules: "Dungeons & Dragons: 3.5",
    userId,
    rulesetId: seedRuleset.id,
    ancestorRulesetIds: [seedRuleset.id],
    status: options.status ?? "Draft",
  });
  const ruleset = rulesets[0];

  // Copy ruleset-level properties (e.g., RULESET_SKILL_POINT_ABILITY_ID)
  const sourceProperties = await Properties.findManyByEntity(db, {
    entityIds: [seedRuleset.id],
    entityType: "rulesets",
  });
  if (sourceProperties.length > 0) {
    await Properties.createMany(db, sourceProperties.map((p) => ({
      ...p,
      id: undefined,
      entityId: ruleset.id,
    })));
  }

  return ruleset;
}

/**
 * Adds a single level to a character via the batch finalizer. Tests used
 * `finalizeLevelUp` for this before batch became the only flow; this wraps
 * `finalizeLevelUp` with one level so call sites stay readable.
 */
export async function addOneLevel(
  session: Session,
  characterId: string,
  klassId: string,
  level: number,
  hp: number,
  abilityId: string | null,
  skills: Record<string, number> = {},
  feats: Record<string, string[]> = {},
  powers: Record<string, string[]> = {},
  force = false,
) {
  const createdLevels = await CharacterLevelsMethods.finalizeLevelUp(
    session,
    characterId,
    [{ klassId, level, hp, abilityId }],
    skills,
    feats,
    powers,
    force,
  );
  return createdLevels[0];
}
