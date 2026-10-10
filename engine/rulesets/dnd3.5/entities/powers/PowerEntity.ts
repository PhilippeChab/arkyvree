/** A power as a ruleset's entity: what the ruleset lists it by, and what its save writes, checked. */

import type { EntityWrites } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import SpellFocusFeats from "@/engine/rulesets/dnd3.5/entities/feats/SpellFocusFeats.ts";
import ListedEntity from "@/engine/rulesets/dnd3.5/entities/ListedEntity.ts";
import type { PowerWithAptitudes } from "@/shared/relations.ts";

import { POWER_FIELDS, type PowerFieldValues } from "./fields.ts";

/** A power's save, as its form sends it: its row's columns, its pools (each at its spell level), and its fields. */
type PowerBody = Partial<PowerFieldValues> & {
  aptitudes?: { id: string; level?: number }[];
  description?: string | null;
  name: string;
  saveEffect?: string | null;
  saveId?: string | null;
};

/** A spell's grouping, which its feats go by: its school, none without one. */
function getGrouping(fields: Partial<PowerFieldValues>) {
  return typeof fields.school === "string" && fields.school.length > 0 ? fields.school : null;
}

/** A power as the ruleset has it: listed by pool and spell level, saved by its rules with its fields and its feats. */
export default class PowerEntity extends ListedEntity<
  "powers",
  PowerBody,
  { description?: string | null; name: string; saveEffect: string | null; saveId: string | null },
  typeof POWER_FIELDS.fields
> {
  /** A spell's school, components, range… */
  protected readonly fields = POWER_FIELDS;

  protected readonly label = "Power";

  readonly type = "powers";

  /**
   * Refuses a new power without a pool, and a power linked to a pool the view's feats use: a save names no spell's save
   * but the one it gives.
   */
  protected override checkSave(body: PowerBody, power?: PowerWithAptitudes) {
    if (!power && !body.aptitudes?.length)
      throw new RulesError("invalid", "At least one aptitude must be selected for the power");
    const listIds = (body.aptitudes ?? []).map((aptitude) => aptitude.id);
    const message = "Cannot link spell to aptitude(s) already used for feats";
    this.refuseLists(listIds, this.rulesetData.aptitudeIdsWithFeats, message);
  }

  /** A form's columns: a save names no spell's save but the one it gives. */
  protected columnsOf({ description, name, saveEffect, saveId }: PowerBody) {
    return { description, name, saveEffect: saveEffect ?? null, saveId: saveId ?? null };
  }

  /** A power's pool links, as the view composes them. */
  protected linksIn({ powersAptitudesInRules }: PowerWithAptitudes) {
    return { powersAptitudesInRules };
  }

  /** The pools a form links the power to, each at its spell level (none: an edit's kept). */
  protected override linksOf({ aptitudes }: PowerBody) {
    return aptitudes?.map((aptitude) => ({ aptitudeId: aptitude.id, level: aptitude.level ?? null }));
  }

  /**
   * What saving a power writes (`power`: the one edited): the fields its form gives, over those it keeps, and the feats
   * of its grouping (a spell's school: its Spell Focus) when it comes to one. A form that gives none of its fields keeps
   * those it has.
   */
  protected override writesOf(body: PowerBody, power?: PowerWithAptitudes): EntityWrites {
    const fields = this.formFields(body, power);
    if (!fields) return {};
    const grouping = getGrouping(fields);
    const before = power && getGrouping(this.fields.read(this.propertiesOf(power)));
    return {
      made: grouping !== null && grouping !== before ? SpellFocusFeats.make(this.view, grouping) : [],
      properties: this.fields.write(fields),
    };
  }

  /**
   * A page of the ruleset's powers, as its form asks for it: what it's read with (`filters`: a list's powers, at a level
   * when one is given), and its rows described, with their lists as the ruleset composes them.
   */
  override openList(where: { aptitudeId?: string; childOnly?: boolean; level?: number }) {
    const { aptitudeId, level } = where;
    const listed = aptitudeId !== undefined || level != null;
    return {
      describe: <T extends Record<string, unknown> & { id: string }>(rows: T[]) => this.describeListed(rows, where),
      filters: { ids: listed ? this.rulesetData.listPowerIds({ aptitudeId, level }) : undefined },
    };
  }
}
