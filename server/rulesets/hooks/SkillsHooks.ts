import type { Db } from "@/server/database/index.ts";

export type PropertyRecord = {
  entityId: string;
  entityType: string;
  type: string;
  value: string;
};

export interface SkillsHooks {
  buildProperties(
    skillId: string,
    body: { impactedByWeight: boolean; usableWithoutTraining: boolean },
  ): PropertyRecord[];

  enrichWithProperties<T extends { id: string }>(
    skills: T[],
    properties: { entityId: string; type: string; value: string }[],
  ): (T & { impactedByWeight: boolean; usableWithoutTraining: boolean })[];

  syncProperties(
    tx: Db,
    skillId: string,
    body: { impactedByWeight: boolean; usableWithoutTraining: boolean },
  ): Promise<void>;
  generateSkillFeat(tx: Db, rulesetId: string, sourceChain: string[], skillName: string): Promise<void>;
  deleteSkillFeat(tx: Db, rulesetId: string, sourceChain: string[], skillName: string): Promise<void>;
}
