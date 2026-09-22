import type { CachedRulesetData } from "@/server/cache/rulesetCache.ts";
import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import {
  Characters,
  Feats,
  Items,
  Klasses,
  KlassLevels,
  Modifiers,
  Powers,
  Races,
} from "@/server/repositories/index.ts";
import type { Modifier, Property, Requirement } from "@/shared/relations.ts";
import BasePolicy from "./BasePolicy.ts";

type CustomizationEntity = Modifier | Requirement | Property;

export default class CustomizationsPolicy extends BasePolicy<CustomizationEntity> {
  /** Resolve the source within the composed ruleset when a scope is supplied.
   * Never fall back to a global lookup for an entity outside that scope.
   */
  static async sourceExists(
    sourceId: string,
    sourceType: string,
    rulesetData?: CachedRulesetData,
  ): Promise<string> {
    let name: string | undefined;

    switch (sourceType) {
      case "feats":
        name = rulesetData
          ? rulesetData.featsById.get(sourceId)?.name
          : (await Feats.findOne(db, { id: sourceId }))?.name;
        break;
      case "items":
        name = rulesetData
          ? rulesetData.itemsById.get(sourceId)?.name
          : (await Items.findOne(db, { id: sourceId }))?.name;
        break;
      case "powers":
        name = rulesetData
          ? rulesetData.powersById.get(sourceId)?.name
          : (await Powers.findOne(db, { id: sourceId }))?.name;
        break;
      case "klass_levels": {
        const kl = rulesetData
          ? rulesetData.klassLevelsById.get(sourceId)
          : await KlassLevels.findOne(db, { id: sourceId });
        name = kl ? `Level ${kl.level}` : undefined;
        break;
      }
      case "races":
        name = rulesetData
          ? rulesetData.racesById.get(sourceId)?.name
          : (await Races.findOne(db, { id: sourceId }))?.name;
        break;
      case "klasses":
        name = rulesetData
          ? rulesetData.klassesById.get(sourceId)?.name
          : (await Klasses.findOne(db, { id: sourceId }))?.name;
        break;
      case "modifiers": {
        const m = rulesetData
          ? rulesetData.modifiersById.get(sourceId)
          : await Modifiers.findOne(db, { id: sourceId });
        name = m ? `${m.target} ${m.operator} ${m.value}` : undefined;
        break;
      }
      case "characters":
        name = rulesetData ? undefined : (await Characters.findOne(db, { id: sourceId }))?.name;
        break;
    }

    if (!name) {
      throw new NotFoundError(`${sourceType} not supported`);
    }

    return name;
  }

  canCreate() {
    return true;
  }

  canRead() {
    return true;
  }

  async canUpdate() {
    const recordId = "sourceId" in this.entity ? this.entity.sourceId : this.entity.entityId;
    const recordType = "sourceType" in this.entity
      ? this.entity.sourceType
      : this.entity.entityType;
    await CustomizationsPolicy.sourceExists(recordId, recordType);

    return true;
  }

  async canDelete() {
    const recordId = "sourceId" in this.entity ? this.entity.sourceId : this.entity.entityId;
    const recordType = "sourceType" in this.entity
      ? this.entity.sourceType
      : this.entity.entityType;
    await CustomizationsPolicy.sourceExists(recordId, recordType);

    return true;
  }
}
