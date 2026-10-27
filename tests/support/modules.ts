import Modules from "@/engine/api/Modules.ts";
import type { Fields } from "@/engine/core/fields/index.ts";
import type { RulesetModule, StorageDeclaration } from "@/engine/core/module/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

/**
 * A flag and a set a made-up module declares on its characters, which no registered module's do: whether it's retired,
 * always written, and its titles, a closed list.
 */
export const CHARACTER_FLAG_AND_SET = {
  retired: {
    description: "Whether it's retired",
    field: "TEST_RETIRED",
    kind: "flag",
    label: "Retired",
    merge: "winner",
    write: "always",
  },
  titles: {
    description: "Its titles",
    field: "TEST_TITLES",
    kind: "list",
    label: "Titles",
    merge: "union",
    values: ["Sir", "Dame", "Lord"],
  },
} as const;

/**
 * Every registered module, its registries' and its fields' declarations (its characters' too) changed by `change`: what
 * a test builds its own storage of (`new StorageEngine(…)`), never the shared one.
 */
export function modulesWith(
  change: (
    registries: StorageDeclaration["registries"],
    fields: Record<string, Fields>,
    characterFields: Fields,
  ) => void,
): [BaseRules, RulesetModule][] {
  return Modules.all().map(([baseRules, module]) => {
    const registries = structuredClone(module.storage.registries);
    const fields = structuredClone(module.fields) as Record<string, Fields>;
    const characterFields = structuredClone(module.characterFields);
    change(registries, fields, characterFields);
    return [baseRules, { ...module, characterFields, fields, storage: { ...module.storage, registries } }];
  });
}

/** Every registered module, its characters declaring a flag and a set more (`CHARACTER_FLAG_AND_SET`). */
export function modulesWithCharacterFlagAndSet(): [BaseRules, RulesetModule][] {
  return modulesWith((_, __, characterFields) => {
    Object.assign(characterFields, CHARACTER_FLAG_AND_SET);
  });
}
