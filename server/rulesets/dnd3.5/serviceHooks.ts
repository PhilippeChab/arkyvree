import type { ServiceHooks } from "@/server/rulesets/engine/hooks/index.ts";

import { Dnd35ClassesHooks } from "./classes/Dnd35ClassesHooks.ts";
import { Dnd35ClassLevelsHooks } from "./classes/Dnd35ClassLevelsHooks.ts";
import { Dnd35InventoryHooks } from "./items/Dnd35InventoryHooks.ts";
import { Dnd35ItemsHooks } from "./items/Dnd35ItemsHooks.ts";
import { Dnd35LevelsHooks } from "./levels/Dnd35LevelsHooks.ts";
import { Dnd35PowersHooks } from "./powers/Dnd35PowersHooks.ts";
import { Dnd35SkillsHooks } from "./skills/Dnd35SkillsHooks.ts";

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
