import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/types.ts";
import type { ViewEntities } from "@/engine/core/view/index.ts";

/** What a refusal calls an entity of each table. */
const ENTITY_LABELS: Record<keyof ViewEntities, string> = {
  abilities: "Ability",
  aptitudes: "Aptitude",
  feats: "Feat",
  items: "Item",
  klass_levels: "Class level",
  klasses: "Class",
  languages: "Language",
  mechanics: "Mechanic",
  powers: "Power",
  races: "Race",
  saves: "Save",
  skills: "Skill",
};

/** The engine bound to an entity of the ruleset's view, of its table (`type`) and its id (a stored id its copy's). */
export default class EntityEngine<K extends keyof ViewEntities> {
  constructor(
    private readonly view: RulesetView,
    private readonly type: K,
    private readonly id: string,
  ) {}

  /** The entity with its customizations: its modifiers, properties and requirements. */
  describe() {
    const entity = this.get();
    return { ...entity, ...this.view.rulesetData.customizationsOf(entity.id) };
  }

  /**
   * The entity as the view has it: the ruleset's own, or inherited through its source chain, an id its copy or winner.
   * Refused as not found when the view has none.
   */
  get(): ViewEntities[K] {
    const entity = this.view.rulesetData.find(this.type, this.id);
    if (!entity) throw new RulesError("not-found", `${ENTITY_LABELS[this.type]} not found in this ruleset`);
    return entity;
  }
}
