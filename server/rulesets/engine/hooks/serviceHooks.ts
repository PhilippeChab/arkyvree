import type { ClassesHooks } from "./ClassesHooks.ts";
import type { ClassLevelsHooks } from "./ClassLevelsHooks.ts";
import type { InventoryHooks } from "./InventoryHooks.ts";
import type { ItemsHooks } from "./ItemsHooks.ts";
import type { LevelsHooks } from "./LevelsHooks.ts";
import type { PowersHooks } from "./PowersHooks.ts";
import type { SkillsHooks } from "./SkillsHooks.ts";

/** The hooks a ruleset gives the services, one per service that takes them. */
export interface ServiceHooks {
  classes: ClassesHooks;
  items: ItemsHooks;
  powers: PowersHooks;
  skills: SkillsHooks;
  classLevels: ClassLevelsHooks;
  levels: LevelsHooks;
  inventory: InventoryHooks;
}
