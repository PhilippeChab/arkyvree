import type { RulesetScope } from "@/server/cache/rulesetCache/index.ts";
import type { Db } from "@/server/database/index.ts";

import type { ClassFields, ClassLevelFields, PowerFields, RaceFields, SkillFlags } from "./rules.ts";

/** What a ruleset writes when a class is saved: its fields. */
export interface ClassesEffects {
  /** Stores the class's fields as its properties, in place of those it stored before. */
  syncProperties(tx: Db, klassId: string, fields: ClassFields): Promise<void>;
}

/** What a ruleset writes when a class level is saved: its fields, and what it requires of the class's earlier levels. */
export interface ClassLevelsEffects {
  /** What a level past the class's first requires of the class's earlier levels. */
  requirePreviousLevel(tx: Db, klassLevel: { id: string; level: number }, className: string): Promise<void>;
  /** Stores the level's fields as its properties, in place of those it stored before. */
  syncProperties(tx: Db, levelId: string, fields: ClassLevelFields): Promise<void>;
}

/** What a ruleset writes when a power is saved: its fields, and the feats of its grouping. */
export interface PowersEffects {
  /**
   * The feats a grouping (a spell's school) brings, in the ruleset the caller's scope is in, unless they're there. Every
   * power of the grouping shares them, so none goes with a power.
   */
  generateFeats(tx: Db, scope: RulesetScope, grouping: string): Promise<void>;
  /** Stores the power's fields as its properties, in place of those it stored before; its other properties stay. */
  syncProperties(tx: Db, powerId: string, fields: PowerFields): Promise<void>;
}

/** What a ruleset writes when a race is saved: its fields. */
export interface RacesEffects {
  /** Stores the race's fields as its properties, in place of those it stored before. */
  syncProperties(tx: Db, raceId: string, fields: RaceFields): Promise<void>;
}

/** What a ruleset does in a service's transaction, one set of effects per area. */
export interface RulesetEffects {
  classes: ClassesEffects;
  classLevels: ClassLevelsEffects;
  powers: PowersEffects;
  races: RacesEffects;
  skills: SkillsEffects;
}

/** What a ruleset writes when a skill is saved or deleted: its flags, and the feat that's the skill's own. */
export interface SkillsEffects {
  /** The skill's own feat, deleted with the skill, unless a character picked it. */
  deleteFeats(tx: Db, scope: RulesetScope, skillName: string): Promise<void>;
  /** The feat that's the skill's own (its Skill Focus), made with the skill. */
  generateFeats(tx: Db, scope: RulesetScope, skillName: string): Promise<void>;
  /** Stores the skill's flags as its properties, in place of those it stored before. */
  syncProperties(tx: Db, skillId: string, flags: SkillFlags): Promise<void>;
}
