import type { ClassesHooks } from "./ClassesHooks.ts";
import type { ItemsHooks } from "./ItemsHooks.ts";
import type { PowersHooks } from "./PowersHooks.ts";
import type { SkillsHooks } from "./SkillsHooks.ts";
import type { ClassLevelsHooks } from "./ClassLevelsHooks.ts";
import type { LevelsHooks } from "./LevelsHooks.ts";
import type { InventoryHooks } from "./InventoryHooks.ts";

export type { ClassesHooks, ItemsHooks, PowersHooks, SkillsHooks, ClassLevelsHooks, LevelsHooks, InventoryHooks };
export type { PropertyRecord } from "./SkillsHooks.ts";

export interface ServiceHooks {
  classes: ClassesHooks;
  items: ItemsHooks;
  powers: PowersHooks;
  skills: SkillsHooks;
  classLevels: ClassLevelsHooks;
  levels: LevelsHooks;
  inventory: InventoryHooks;
}
