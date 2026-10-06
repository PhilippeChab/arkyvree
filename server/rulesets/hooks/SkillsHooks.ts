import type { CachedRulesetData } from "@/server/cache/rulesetCache/index.ts";
import type { Db } from "@/server/database/index.ts";

export type PropertyRecord = {
  entityId: string;
  entityType: string;
  type: string;
  value: string;
};

/** A skill's flags, kept as its properties: whether armor weighs on it, how many times over, and untrained use. */
export type SkillFlags = { impactedByWeight: boolean; checkPenaltyMultiplier: number; usableWithoutTraining: boolean };

export interface SkillsHooks {
  buildProperties(skillId: string, flags: SkillFlags): PropertyRecord[];

  enrichWithProperties<T extends { id: string }>(
    skills: T[],
    properties: { entityId: string; type: string; value: string }[],
  ): (T & SkillFlags)[];

  /** Stores the skill's flags as its properties, and answers them as stored. */
  syncProperties(tx: Db, skillId: string, flags: SkillFlags): Promise<SkillFlags>;
  generateSkillFeat(tx: Db, rulesetId: string, sourceChain: string[], skillName: string): Promise<void>;
  deleteSkillFeat(
    tx: Db,
    ruleset: { id: string; extensionRulesetIds: string[] },
    rulesetData: CachedRulesetData,
    skillName: string,
  ): Promise<void>;
}
