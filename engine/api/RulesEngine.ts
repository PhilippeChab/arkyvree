import { FieldCodec } from "@/engine/core/fields/index.ts";
import type { RulesDescription, RulesetModule } from "@/engine/core/module/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

import StorageEngine from "./StorageEngine.ts";

/**
 * The engine asked of what every base rules' rulesets share, before any ruleset: their words, kinds, fields, license
 * and the programs they import characters from.
 */
export default class RulesEngine {
  constructor(private readonly modules: [BaseRules, RulesetModule][]) {}

  /**
   * Each owner type's fields as its form shows them (`module.fields`, its declarations: an entity type's, `rulesets` a
   * ruleset's Settings'), by type, in its name's order: a type whose form shows none left out. Its declarations alone
   * describe them, whatever ruleset a form is of.
   */
  private static fieldsOf(module: RulesetModule): RulesDescription["fields"] {
    return Object.fromEntries(
      Object.keys(module.fields)
        .toSorted()
        .flatMap((type) => {
          const described = new FieldCodec(module.fields[type]).describe();
          return described.length > 0 ? [[type, described]] : [];
        }),
    );
  }

  /** What each base rules' rulesets share, by base rules: what the client reads once, for every ruleset it shows. */
  describeAll(): Record<BaseRules, RulesDescription> {
    return Object.fromEntries(
      this.modules.map(([baseRules, module]) => [
        baseRules,
        {
          ...module.ruleset.describeRules(),
          customizationPages: StorageEngine.customizationPagesOf(module.storage),
          fields: RulesEngine.fieldsOf(module),
          importers: module.imports.describeImporters().programs,
        },
      ]),
    ) as Record<BaseRules, RulesDescription>;
  }
}
