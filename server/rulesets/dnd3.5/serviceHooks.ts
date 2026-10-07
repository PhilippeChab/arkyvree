import type { ServiceHooks } from "@/server/rulesets/engine/hooks/index.ts";

import { Dnd35ClassesHooks } from "./classes/ClassesHooks.ts";
import { Dnd35ClassLevelsHooks } from "./classes/ClassLevelsHooks.ts";
import { Dnd35InventoryHooks } from "./items/InventoryHooks.ts";
import { Dnd35ItemsHooks } from "./items/ItemsHooks.ts";
import { Dnd35LevelsHooks } from "./levels/LevelsHooks.ts";
import { Dnd35PowersHooks } from "./powers/PowersHooks.ts";
import { Dnd35SkillsHooks } from "./skills/SkillsHooks.ts";

/** The 3.5 rules' hooks, one per service that takes them. */
export function createServiceHooks(): ServiceHooks {
  return {
    classes: new Dnd35ClassesHooks(),
    items: new Dnd35ItemsHooks(),
    powers: new Dnd35PowersHooks(),
    skills: new Dnd35SkillsHooks(),
    classLevels: new Dnd35ClassLevelsHooks(),
    levels: new Dnd35LevelsHooks(),
    inventory: new Dnd35InventoryHooks(),
  };
}
