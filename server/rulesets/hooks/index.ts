import type { ClassesHooks } from "./ClassesHooks.ts";
import type { ClassLevelsHooks } from "./ClassLevelsHooks.ts";
import type { InventoryHooks } from "./InventoryHooks.ts";
import type { ItemsHooks } from "./ItemsHooks.ts";
import type { LevelsHooks } from "./LevelsHooks.ts";
import type { PowersHooks } from "./PowersHooks.ts";
import type { SkillsHooks } from "./SkillsHooks.ts";

export type { ClassesHooks, ItemsHooks, PowersHooks, SkillsHooks, ClassLevelsHooks, LevelsHooks, InventoryHooks };
export type { PowerBody } from "./PowersHooks.ts";
export type { PropertyRecord, SkillFlags } from "./SkillsHooks.ts";

export interface ServiceHooks {
  classes: ClassesHooks;
  items: ItemsHooks;
  powers: PowersHooks;
  skills: SkillsHooks;
  classLevels: ClassLevelsHooks;
  levels: LevelsHooks;
  inventory: InventoryHooks;
}
