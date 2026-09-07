import type { ServiceHooks } from "@/server/rulesets/hooks/index.ts";
import { Dnd35ClassesHooks } from "./ClassesHooks.ts";
import { Dnd35ItemsHooks } from "./ItemsHooks.ts";
import { Dnd35PowersHooks } from "./PowersHooks.ts";
import { Dnd35SkillsHooks } from "./SkillsHooks.ts";
import { Dnd35ClassLevelsHooks } from "./ClassLevelsHooks.ts";
import { Dnd35LevelsHooks } from "./LevelsHooks.ts";
import { Dnd35InventoryHooks } from "./InventoryHooks.ts";

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
