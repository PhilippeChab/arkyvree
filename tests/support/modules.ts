import Modules from "@/engine/api/Modules.ts";
import StorageEngine from "@/engine/api/StorageEngine.ts";
import type { Fields } from "@/engine/core/fields/index.ts";
import type { RulesetModule, StorageDeclaration } from "@/engine/core/module/index.ts";
import type { BaseRules } from "@/shared/enums.ts";
import { DND35_BASE_RULES } from "@/vocabulary/dnd3.5/baseRules.ts";

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
 * a test builds its own storages of (`storagesOf`), never the shared ones.
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

/**
 * Every registered module, and a made-up one beside them (`second`), the first's but for its storage and its fields: it
 * stores no kind, role or step of its own, and declares these fields alone (`fields`, by owner type: its characters',
 * its rulesets' Settings').
 */
export function modulesWithSecond(fields: Record<string, Fields>): [BaseRules, RulesetModule][] {
  const [[, first]] = Modules.all();
  const { [StorageEngine.of(DND35_BASE_RULES).characterOwnerType]: characterFields = {}, ...owners } = fields;
  const registries = { characterRoles: [], entityTypes: [], itemTypes: [], linkRoles: [], rulesetRoles: [], steps: [] };
  const storage = { character: { playerKind: "second-pc", scoredRoles: [] }, kinds: {}, registries };
  return [...Modules.all(), ["second" as BaseRules, { ...first, characterFields, fields: owners, storage }]];
}

/**
 * Each module's storage (`modules`, a test's own: `modulesWith`, `modulesWithSecond`), by its base rules: what a write
 * a test makes reads a character's module's declarations by, never the shared ones.
 */
export function storagesOf(modules: [BaseRules, RulesetModule][]): (baseRules: BaseRules) => StorageEngine {
  const storages = new Map(modules.map(([baseRules, module]) => [baseRules, new StorageEngine(baseRules, module)]));
  return (baseRules) => {
    const storage = storages.get(baseRules);
    if (!storage) throw new Error(`No module of ${baseRules}`);
    return storage;
  };
}
