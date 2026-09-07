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
  /**
   * Resolves a display name for the source of a customization row. When
   * `rulesetData` is supplied (caller is inside a `withRulesetScope`), the
   * lookup serves from the composed cache — no DB trips. Otherwise falls
   * back to `findOne(db, ...)` for each entity type (used by the policy's
   * own `canUpdate`/`canDelete` guards where no scope is active).
   *
   * "characters" never appears in `rulesetData` (character rows are
   * character-scoped, not ruleset-scoped) so that branch always hits the DB.
   */
  static async sourceExists(
    sourceId: string,
    sourceType: string,
    rulesetData?: CachedRulesetData,
  ): Promise<string> {
    let name: string | undefined;

    switch (sourceType) {
      case "feats":
        name = rulesetData?.featsById.get(sourceId)?.name
          ?? (await Feats.findOne(db, { id: sourceId }))?.name;
        break;
      case "items":
        name = rulesetData?.itemsById.get(sourceId)?.name
          ?? (await Items.findOne(db, { id: sourceId }))?.name;
        break;
      case "powers":
        name = rulesetData?.powersById.get(sourceId)?.name
          ?? (await Powers.findOne(db, { id: sourceId }))?.name;
        break;
      case "klass_levels": {
        const kl = rulesetData?.klassLevelsById.get(sourceId)
          ?? await KlassLevels.findOne(db, { id: sourceId });
        name = kl ? `Level ${kl.level}` : undefined;
        break;
      }
      case "races":
        name = rulesetData?.racesById.get(sourceId)?.name
          ?? (await Races.findOne(db, { id: sourceId }))?.name;
        break;
      case "klasses":
        name = rulesetData?.klassesById.get(sourceId)?.name
          ?? (await Klasses.findOne(db, { id: sourceId }))?.name;
        break;
      case "modifiers": {
        const m = rulesetData?.modifiersById.get(sourceId)
          ?? await Modifiers.findOne(db, { id: sourceId });
        name = m ? `${m.target} ${m.operator} ${m.value}` : undefined;
        break;
      }
      case "characters":
        name = (await Characters.findOne(db, { id: sourceId }))?.name ?? "Character";
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
