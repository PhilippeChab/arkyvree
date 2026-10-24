import type { RulesDescription, RulesetModule, StorageDeclaration } from "@/engine/core/module/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

/** The engine asked of what every base rules' rulesets share, before any ruleset: their words, kinds and license. */
export default class RulesEngine {
  constructor(private readonly modules: [BaseRules, RulesetModule][]) {}

  /**
   * The kinds a module's storage declares customizable (`storage`) whose customizations have a page of their own: all
   * but a kind that owns another, whose customizations are its page's tabs.
   */
  private static customizationPagesOf(storage: StorageDeclaration): RulesDescription["customizationPages"] {
    const { entityTypes } = storage.registries;
    const owners = new Set(entityTypes.map((def) => def.ownerType));
    // An owned kind's owner, by the column its rows name it in
    const ownerKeyOf = (type: string) =>
      Object.entries(storage.kinds[type].columns ?? {}).find(([, column]) => column.kind === "owner")?.[0];
    return entityTypes
      .filter(({ type }) => storage.kinds[type].customizable && !owners.has(type))
      .map(({ ownerType, type }) => {
        const ownerKey = ownerType && ownerKeyOf(type);
        return { type, ...(ownerType && { owner: ownerType }), ...(ownerKey && { ownerKey }) };
      });
  }

  /** What each base rules' rulesets share, by base rules: what the client reads once, for every ruleset it shows. */
  describeAll(): Record<BaseRules, RulesDescription> {
    return Object.fromEntries(
      this.modules.map(([baseRules, module]) => [
        baseRules,
        { ...module.ruleset.describeRules(), customizationPages: RulesEngine.customizationPagesOf(module.storage) },
      ]),
    ) as Record<BaseRules, RulesDescription>;
  }
}
