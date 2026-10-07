/** A power as a ruleset's entity: what saving it writes. */

import type { EntityWrites } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/types.ts";

import { POWER_FIELD_PROPERTY_TYPES, type PowerFields, readPowerFields, toPowerProperties } from "./powerFields.ts";
import { buildSpellFocusFeats } from "./spellGenerator.ts";

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
] as const satisfies (keyof PowerFields)[];

/** A spell's grouping, which its feats go by: its school, none without one. */
function getGrouping(fields: PowerFields) {
  return typeof fields.school === "string" && fields.school.length > 0 ? fields.school : null;
}

/**
 * What saving a power writes (`before`: the properties it kept, for an edit): its fields as properties, and the feats
 * of its grouping (a spell's school: its Spell Focus) when it comes to one. An edit that gives none of its fields keeps
 * those it has.
 */
export function planPowerSave(
  _view: RulesetView,
  power: PowerFields,
  before?: { properties: { type: string; value: string }[] },
): EntityWrites {
  if (before && POWER_FIELD_KEYS.every((key) => power[key] === undefined))
    return { columns: {}, generatedFeats: [], removedFeats: [] };
  const grouping = getGrouping(power);
  const isNewGrouping = grouping !== null && grouping !== (before && getGrouping(readPowerFields(before.properties)));
  return {
    columns: {},
    generatedFeats: isNewGrouping ? [buildSpellFocusFeats(grouping)] : [],
    properties: { types: POWER_FIELD_PROPERTY_TYPES, values: toPowerProperties(power) },
    removedFeats: [],
  };
}
