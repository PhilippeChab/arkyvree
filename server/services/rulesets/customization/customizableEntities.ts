import type { RulesetData } from "@/server/cache/rulesetCache/index.ts";
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

/** A 404 unless the entity `customization` is made on still exists. */
export async function checkCustomizedEntity(customization: Modifier | Requirement | Property) {
  if ("sourceId" in customization) await getCustomizableEntityName(customization.sourceId, customization.sourceType);
  else await getCustomizableEntityName(customization.entityId, customization.entityType);
}

/**
 * The name of an entity customizations can be made on, or a 404: it exists, within the composed ruleset when one is
 * given, never falling back to a global lookup for an entity outside it.
 */
export async function getCustomizableEntityName(
  entityId: string,
  entityType: string,
  rulesetData?: RulesetData,
): Promise<string> {
  let name: string | undefined;

  switch (entityType) {
    case "feats":
      name = rulesetData
        ? rulesetData.featsById.get(entityId)?.name
        : (await Feats.findOne(db, { id: entityId }))?.name;
      break;
    case "items":
      name = rulesetData
        ? rulesetData.itemsById.get(entityId)?.name
        : (await Items.findOne(db, { id: entityId }))?.name;
      break;
    case "powers":
      name = rulesetData
        ? rulesetData.powersById.get(entityId)?.name
        : (await Powers.findOne(db, { id: entityId }))?.name;
      break;
    case "klass_levels": {
      const kl = rulesetData
        ? rulesetData.klassLevelsById.get(entityId)
        : await KlassLevels.findOne(db, { id: entityId });
      name = kl ? `Level ${kl.level}` : undefined;
      break;
    }
    case "races":
      name = rulesetData
        ? rulesetData.racesById.get(entityId)?.name
        : (await Races.findOne(db, { id: entityId }))?.name;
      break;
    case "klasses":
      name = rulesetData
        ? rulesetData.klassesById.get(entityId)?.name
        : (await Klasses.findOne(db, { id: entityId }))?.name;
      break;
    case "modifiers": {
      const m = rulesetData ? rulesetData.modifiersById.get(entityId) : await Modifiers.findOne(db, { id: entityId });
      name = m ? `${m.target} ${m.operator} ${m.value}` : undefined;
      break;
    }
    case "characters":
      name = rulesetData ? undefined : (await Characters.findOne(db, { id: entityId }))?.name;
      break;
  }

  if (!name) throw new NotFoundError(`${entityType} not supported`);

  return name;
}
