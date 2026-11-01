/** What a ruleset's base rules are, as v1 answers them: kinds, fields, tiers, progression's names, character form. */

import type { z } from "zod";

import type { StorageEngine } from "@/engine/index.ts";
import type { v1Rules } from "@/server/routers/v1/schemas/rules.ts";
import type { RulesService } from "@/server/services/rules/index.ts";

/** What the storage declares of the kinds, past the rules' description: which own which, which are customized. */
type KindStorage = Pick<StorageEngine, "customizableKinds" | "ownedKinds">;

/** What one base rules' rulesets are made of, as the engine describes it. */
type RulesDescription = ReturnType<typeof RulesService.getRules>[keyof ReturnType<typeof RulesService.getRules>];

/**
 * One base rules' description: what v1 names of it, its kinds' parts as the storage declares them (the kind each owns,
 * those customized), and the tables a progressing kind answers, as its progression names them.
 */
function toV1RulesDescription(rules: RulesDescription, storage: KindStorage): z.infer<typeof v1Rules>[string] {
  const { counts, grants, tables } = rules.progression;
  const ownTypes = rules.kinds.flatMap(({ type }) => [type, ...storage.ownedKinds(type)]);
  const tableNames = [grants?.table, counts?.lists, ...tables.map(({ table }) => table)].filter(
    (name) => name !== undefined,
  );
  return {
    characterForm: { sections: rules.characterForm.sections.map((section) => ({ ...section })) },
    characterKinds: rules.entityKinds.map(({ label, value }) => ({ label, value })),
    customizable: storage.customizableKinds().filter((type) => ownTypes.includes(type)),
    fields: Object.fromEntries(
      Object.entries(rules.fields).map(([kind, fields]) => [kind, (fields ?? []).map((field) => ({ ...field }))]),
    ),
    kinds: rules.kinds.map((kind) => ({
      families: kind.families ?? false,
      links: kind.links ? { role: kind.links.role, type: kind.links.type } : null,
      owns: storage.ownedKinds(kind.type)[0] ?? null,
      partitioned: kind.partitioned ?? false,
      pools: kind.pools ? { role: kind.pools.role, scope: kind.pools.scope, type: kind.pools.type } : null,
      progression: kind.opens === "progression",
      readOnly: kind.readOnly ?? false,
      tables: kind.opens === "progression" ? [...new Set(tableNames)] : [],
      templates: kind.copies?.template !== undefined,
      tiered: kind.levels ?? false,
      type: kind.type,
    })),
    progression: {
      list: counts?.list ?? null,
      picks: grants?.picks ?? null,
      several: counts?.several ?? null,
    },
    tiers: rules.tiers.map(({ label, level }) => ({ label, level })),
  };
}

/** Each base rules' description, by its name, its kinds' parts as the storage declares them. */
export function toV1Rules(
  rules: ReturnType<typeof RulesService.getRules>,
  storage: KindStorage,
): z.infer<typeof v1Rules> {
  return Object.fromEntries(
    Object.entries(rules).map(([baseRules, rule]) => [baseRules, toV1RulesDescription(rule, storage)]),
  );
}
