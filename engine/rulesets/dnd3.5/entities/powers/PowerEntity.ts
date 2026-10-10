/** A power as a ruleset's entity: what the ruleset lists it by, and what its form writes, checked. */

import { z } from "zod";

import { ListedEntity } from "@/engine/core/entities/index.ts";
import type { EntityWrites } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import SpellFocusFeats from "@/engine/rulesets/dnd3.5/entities/feats/SpellFocusFeats.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/dnd3.5/limits.ts";
import type { PowerWithAptitudes } from "@/shared/relations.ts";

import { POWER_FIELDS, type PowerFieldValues } from "./fields.ts";

/** A power's save, as its form sends it: its row's columns, its pools (each at its spell level), and its fields. */
interface PowerBody {
  aptitudes?: { id: string; level?: number }[];
  description?: string | null;
  fields?: Partial<PowerFieldValues>;
  name: string;
  saveEffect?: string | null;
  saveId?: string | null;
}

/** A spell's level: 0 to the rules' last. */
const SPELL_LEVEL = z.number().int().min(0).max(RULESET_LIMITS.spellLevel);

/** A power's pools, each at its spell level. */
const POOL_LEVELS = z.array(z.object({ level: SPELL_LEVEL.optional() })).optional();

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
  /** The Spell Focus feats a power's school brings. */
  private readonly spellFocus = new SpellFocusFeats(this.view);

  /** A spell's school, components, range… */
  protected override readonly fields = POWER_FIELDS;

  protected override readonly label = "Power";

  override readonly type = "powers";

  /**
   * Refuses a new power without a pool, a pool's spell level past the rules' bounds, and a power linked to a pool the
   * view's feats use: a form names no spell's save but the one it gives.
   */
  protected override checkForm(body: PowerBody, power?: PowerWithAptitudes) {
    RulesError.parse(POOL_LEVELS, body.aptitudes, ["aptitudes"]);
    if (!power && !body.aptitudes?.length)
      throw new RulesError("invalid", "At least one aptitude must be selected for the power");
    const listIds = (body.aptitudes ?? []).map((aptitude) => aptitude.id);
    const message = "Cannot link spell to aptitude(s) already used for feats";
    this.refuseLists(listIds, this.rulesetData.aptitudeIdsWithFeats, message);
  }

  /** A form's columns: it names no spell's save but the one it gives. */
  protected override columnsOf({ description, name, saveEffect, saveId }: PowerBody) {
    return { description, name, saveEffect: saveEffect ?? null, saveId: saveId ?? null };
  }

  /** What a form's fields are read by: those it gives, a new power's too, since a power that isn't a spell has none. */
  protected override fieldsSchema() {
    return this.fields.schema({ optional: true });
  }

  /** A power's pool links, as the view composes them. */
  protected override linksIn({ powersAptitudesInRules }: PowerWithAptitudes) {
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
  protected override writesOf(
    _body: PowerBody,
    given: Partial<PowerFieldValues>,
    power?: PowerWithAptitudes,
  ): EntityWrites {
    const fields = this.formFields(given, power);
    if (!fields) return {};
    const grouping = getGrouping(fields);
    const before = power && getGrouping(this.fields.read(this.propertiesOf(power)));
    return {
      made: grouping !== null && grouping !== before ? this.spellFocus.make(grouping) : [],
      properties: this.fields.write(fields),
    };
  }

  /**
   * A page of the ruleset's powers, as its form asks for it: what it's read with (`filters`: a list's powers, at a level
   * when one is given), and its rows described, with their lists as the ruleset composes them. Refused at a level past
   * the rules' bounds.
   */
  override openList(where: { aptitudeId?: string; childOnly?: boolean; level?: number }) {
    const { aptitudeId, level } = where;
    RulesError.parse(SPELL_LEVEL.optional(), level, ["level"]);
    const listed = aptitudeId !== undefined || level != null;
    return {
      describe: <T extends Record<string, unknown> & { id: string }>(rows: T[]) => this.describeListed(rows),
      filters: { ids: listed ? this.rulesetData.listPowerIds({ aptitudeId, level }) : undefined },
    };
  }
}
