/** A power as a ruleset's entity: what saving it writes. */

import type { EntityWrites } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/types.ts";

import PowerFields, { POWER_FIELD_PROPERTY_TYPES, type PowerFieldValues } from "./PowerFields.ts";
import SpellGenerator from "./SpellGenerator.ts";

/** A power's fields a save is given. */
const POWER_FIELD_KEYS = [
  "areaOfEffect",
  "castingTime",
  "components",
  "descriptors",
  "duration",
  "rangeType",
  "school",
  "spellResistance",
  "subschool",
  "target",
] as const satisfies (keyof PowerFieldValues)[];

/** A spell's grouping, which its feats go by: its school, none without one. */
function getGrouping(fields: PowerFieldValues) {
  return typeof fields.school === "string" && fields.school.length > 0 ? fields.school : null;
}

/** What a power's save writes beside its row: its fields, and the feats its grouping makes. */
export default class PowerEntity {
  /**
   * What saving a power writes (`before`: the properties it kept, for an edit): its fields as properties, and the feats
   * of its grouping (a spell's school: its Spell Focus) when it comes to one. An edit that gives none of its fields keeps
   * those it has.
   */
  static planSave(
    _view: RulesetView,
    power: PowerFieldValues,
    before?: { properties: { type: string; value: string }[] },
  ): EntityWrites {
    if (before && POWER_FIELD_KEYS.every((key) => power[key] === undefined))
      return { columns: {}, generatedFeats: [], removedFeats: [] };
    const grouping = getGrouping(power);
    const isNewGrouping =
      grouping !== null && grouping !== (before && getGrouping(PowerFields.read(before.properties)));
    return {
      columns: {},
      generatedFeats: isNewGrouping ? [SpellGenerator.buildSpellFocusFeats(grouping)] : [],
      properties: { types: POWER_FIELD_PROPERTY_TYPES, values: PowerFields.toProperties(power) },
      removedFeats: [],
    };
  }
}
