import RulesError from "@/engine/core/RulesError.ts";
import { type RulesetData, type RulesetView } from "@/engine/core/view/index.ts";

/** An entity customizations are made on, as the ruleset's view has it: its id there, and the name a history shows. */
export default class CustomizedEntity {
  /**
   * The name of an entity customizations can be made on, as its view has it (a class level by its level, a modifier by
   * what it does), or none when the view has no such entity, or it isn't one customizations are made on.
   */
  private static nameOf(rulesetData: RulesetData, entityType: string, entityId: string): string | undefined {
    switch (entityType) {
      case "feats":
        return rulesetData.featsById.get(entityId)?.name;
      case "items":
        return rulesetData.itemsById.get(entityId)?.name;
      case "powers":
        return rulesetData.powersById.get(entityId)?.name;
      case "klass_levels": {
        const level = rulesetData.klassLevelsById.get(entityId);
        return level ? `Level ${level.level}` : undefined;
      }
      case "races":
        return rulesetData.racesById.get(entityId)?.name;
      case "klasses":
        return rulesetData.klassesById.get(entityId)?.name;
      case "modifiers": {
        const modifier = rulesetData.modifiersById.get(entityId);
        return modifier ? `${modifier.target} ${modifier.operator} ${modifier.value}` : undefined;
      }
      default:
        return undefined;
    }
  }

  /**
   * The entity `entityId` names, of `entityType`, in the ruleset's view: its id there (a stored id its copy or winner),
   * and its name. Refused as not found when the view has none, or it isn't one customizations are made on.
   */
  static find(view: RulesetView, entityType: string, entityId: string) {
    const id = view.rulesetData.canonicalize(entityId);
    const name = CustomizedEntity.nameOf(view.rulesetData, entityType, id);
    if (!name) throw new RulesError("not-found", `${entityType} not supported`);
    return { id, name };
  }
}
