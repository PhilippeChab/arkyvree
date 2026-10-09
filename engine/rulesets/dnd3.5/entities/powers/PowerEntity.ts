/** A power as a ruleset's entity: what the ruleset lists it by, and what its save writes, checked. */

import type { EntityWrites } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import SpellFocusFeats from "@/engine/rulesets/dnd3.5/entities/feats/SpellFocusFeats.ts";

import PowerFields, { POWER_FIELD_PROPERTY_TYPES, type PowerFieldValues } from "./PowerFields.ts";

/** A power's save, as its form sends it: its row's columns, its pools (each at its spell level), and its fields. */
type PowerBody = PowerFieldValues & {
  aptitudes?: { id: string; level?: number }[];
  description?: string | null;
  name: string;
  saveEffect?: string | null;
  saveId?: string | null;
};

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

/** A power as the ruleset has it: listed by pool and spell level, saved by its rules with its fields and its feats. */
export default class PowerEntity {
  /** Refuses a power linked to a pool the view's feats use: the ruleset's own and its chain's, no other ruleset's. */
  private static checkPools(view: RulesetView, aptitudes: { id: string }[]) {
    if (aptitudes.some((aptitude) => view.rulesetData.listFeatIds(aptitude.id).length > 0))
      throw new RulesError("conflict", "Cannot link spell to aptitude(s) already used for feats");
  }

  /** A power's row and pool links, from its form: a save names no spell's save but the one it gives. */
  private static toRows({ aptitudes, description, name, saveEffect, saveId }: PowerBody) {
    return {
      aptitudes: aptitudes?.map((aptitude) => ({ aptitudeId: aptitude.id, level: aptitude.level ?? null })),
      columns: { description, name, saveEffect: saveEffect ?? null, saveId: saveId ?? null },
    };
  }

  /**
   * A page of the ruleset's powers, as its form asks for it: what it's read with (`filters`: a list's powers, at a level
   * when one is given), and its rows described (`describe`), each inherited power with its lists as the ruleset composes
   * them, its siblings' links merged in, unless the page lists the ruleset's own powers only.
   */
  static openList(view: RulesetView, where: { aptitudeId?: string; childOnly?: boolean; level?: number }) {
    const { rulesetData } = view;
    const { aptitudeId, level } = where;
    const ids = aptitudeId !== undefined || level != null ? rulesetData.listPowerIds({ aptitudeId, level }) : undefined;
    const composesLinks = rulesetData.cow.sourceChain.length > 0 && !where.childOnly;
    return {
      describe<T extends { id: string; powersAptitudesInRules: unknown }>(stored: T[]) {
        const rows = rulesetData.cow.resolveRows(stored);
        if (!composesLinks) return rows;
        return rows.map((power) => {
          const merged = rulesetData.powersById.get(power.id);
          return merged ? { ...power, powersAptitudesInRules: merged.powersAptitudesInRules } : power;
        });
      },
      filters: { ids },
    };
  }

  /**
   * A new power's row, its pool links and what its save writes beside them (`planSave`): refused without a pool, or
   * with a pool a feat uses.
   */
  static planCreate(view: RulesetView, body: PowerBody) {
    if (!body.aptitudes || body.aptitudes.length === 0)
      throw new RulesError("invalid", "At least one aptitude must be selected for the power");
    PowerEntity.checkPools(view, body.aptitudes);
    const { aptitudes = [], columns } = PowerEntity.toRows(body);
    return { aptitudes, columns, writes: PowerEntity.planSave(view, body) };
  }

  /**
   * A power's edit (`powerId`): the power as the view has it, its new row, its new pool links when the form sends them,
   * and what its save writes beside them, against the properties the view composes for it (those a copy of it holds).
   * Refused when a pool a feat uses is linked.
   */
  static planEdit(view: RulesetView, powerId: string, body: PowerBody) {
    const power = view.rulesetData.find("powers", powerId);
    if (!power) throw new RulesError("not-found", "Power not found in this ruleset");
    if (body.aptitudes?.length) PowerEntity.checkPools(view, body.aptitudes);
    const properties = view.rulesetData.propertiesByEntity.get(power.id) ?? [];
    return { ...PowerEntity.toRows(body), power, writes: PowerEntity.planSave(view, body, { properties }) };
  }

  /**
   * What saving a power writes (`before`: the properties it kept, for an edit): its fields as properties, and the feats
   * of its grouping (a spell's school: its Spell Focus) when it comes to one. An edit that gives none of its fields keeps
   * those it has.
   */
  static planSave(
    view: RulesetView,
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
      generatedFeats: isNewGrouping ? SpellFocusFeats.buildSpellFocusFeats(view, grouping) : [],
      properties: { types: POWER_FIELD_PROPERTY_TYPES, values: PowerFields.toProperties(power) },
      removedFeats: [],
    };
  }
}
