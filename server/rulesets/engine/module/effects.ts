import type { RulesetScope } from "@/server/cache/rulesetCache/index.ts";
import type { Db } from "@/server/database/index.ts";

import type { PowerBody, SkillFlags } from "./rules.ts";

/** What a ruleset writes when a class level is saved. */
export interface ClassLevelsEffects {
  /** What a level past the class's first requires of the class's earlier levels. */
  requirePreviousLevel(tx: Db, klassLevel: { id: string; level: number }, className: string): Promise<void>;
  syncProperties(tx: Db, levelId: string, body: { bab: number; skills: number }): Promise<void>;
}

/** What a ruleset writes when a power is saved: its generated properties, and its grouping's feats. */
export interface PowersEffects {
  /** The feats a grouping (a spell's school) brings, in the ruleset the caller's scope is in. */
  generateGroupingFeats(tx: Db, scope: RulesetScope, value: string): Promise<void>;
  generateProperties(tx: Db, powerId: string, body: PowerBody): Promise<void>;
}

/** What a ruleset does in a service's transaction, one set of effects per area. */
export interface RulesetEffects {
  classLevels: ClassLevelsEffects;
  powers: PowersEffects;
  skills: SkillsEffects;
}

/** What a ruleset writes when a skill is saved or deleted: its flags, and its Skill Focus feat. */
export interface SkillsEffects {
  deleteSkillFeat(tx: Db, scope: RulesetScope, skillName: string): Promise<void>;
  generateSkillFeat(tx: Db, scope: RulesetScope, skillName: string): Promise<void>;
  /** Stores the skill's flags as its properties, and answers them as stored. */
  syncProperties(tx: Db, skillId: string, flags: SkillFlags): Promise<SkillFlags>;
}
