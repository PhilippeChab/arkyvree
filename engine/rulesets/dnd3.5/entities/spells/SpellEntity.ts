/** A spell as a ruleset's entity: what the ruleset lists it by, and what its form writes, checked. */

import { z } from "zod";

import type { EntityFieldValues } from "@/engine/core/fields/index.ts";
import type { EntityRecord, EntityWrites } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import SpellFocusFeats from "@/engine/rulesets/dnd3.5/entities/feats/SpellFocusFeats.ts";
import ListedEntity from "@/engine/rulesets/dnd3.5/entities/ListedEntity.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/dnd3.5/limits.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Spell } from "@/engine/rulesets/dnd3.5/view/rows.ts";

import { SPELL_COLUMNS } from "./columns.ts";
import { SPELL_FIELDS, type SpellFieldValues } from "./fields.ts";

/** A spell's save, as its form sends it: its row's columns, its pools (each at its spell level), and its fields. */
interface SpellBody {
  aptitudes?: { id: string; level?: number }[];
  description?: string | null;
  fields?: EntityFieldValues;
  name: string;
  saveEffect?: string | null;
  saveId?: string | null;
}

/** A spell's level: 0 to the rules' last. */
const SPELL_LEVEL = z.number().int().min(0).max(RULESET_LIMITS.spellLevel);

/** A spell's grouping, which its feats go by: its school, none without one. */
function getGrouping(fields: Partial<SpellFieldValues>) {
  return typeof fields.school === "string" && fields.school.length > 0 ? fields.school : null;
}

/** A spell as the ruleset has it: listed by pool and spell level, saved by its rules with its fields and its feats. */
export default class SpellEntity extends ListedEntity<
  "spells",
  SpellBody,
  { description?: string | null; name: string; saveEffect?: string | null; saveId?: string | null },
  typeof SPELL_FIELDS.fields
> {
  /** The Spell Focus feats a spell's school brings. */
  private readonly spellFocus = new SpellFocusFeats(this.view);

  /** Its saving throw, what a save does, and its spell lists at their levels. */
  protected override readonly columns = SPELL_COLUMNS;

  /** A spell's school, components, range… */
  protected override readonly fields = SPELL_FIELDS;

  protected override readonly label = "Spell";

  /** Its list's filters: a list's spells (`aptitudeId`), at a level. */
  protected override readonly listFilters = { aptitudeId: z.string().uuid(), level: z.coerce.number() };

  override readonly type = "spells";

  /**
   * Refuses a spell linked to a pool the view's feats use (its columns refuse a new one without a pool, and a pool's
   * spell level past the rules' bounds).
   */
  protected override checkForm(body: SpellBody) {
    const listIds = (body.aptitudes ?? []).map((aptitude) => aptitude.id);
    const message = "Cannot link spell to aptitude(s) already used for feats";
    this.refuseLists(listIds, Dnd35View.of(this.rulesetData).aptitudeIdsWithFeats, message);
  }

  /** A form's columns: the save it gives (none clears it), an edit's that leaves it out kept. */
  protected override columnsOf({ description, name, saveEffect, saveId }: SpellBody) {
    return { description, name, saveEffect, saveId };
  }

  /** The pools a form links the spell to, each at its spell level (none: an edit's kept). */
  protected override linksOf({ aptitudes }: SpellBody) {
    return (
      aptitudes && this.listedIn(aptitudes.map((aptitude) => ({ tier: aptitude.level ?? null, toId: aptitude.id })))
    );
  }

  /**
   * A page of the ruleset's spells, as its query asks for it: what it's read with (`filters`: a list's spells, at a level
   * when one is given), and its records described, with their links as the ruleset composes them. Refused at a level past
   * the rules' bounds.
   */
  protected override listOf(where: { aptitudeId?: string; level?: number }) {
    const { aptitudeId, level } = where;
    RulesError.parse(SPELL_LEVEL.optional(), level, ["level"]);
    const listed = aptitudeId !== undefined || level != null;
    return {
      describe: <T extends Pick<EntityRecord, "fields" | "id" | "links">>(rows: T[]) => this.describeListed(rows),
      filters: { ids: listed ? Dnd35View.of(this.rulesetData).listSpellIds({ aptitudeId, level }) : undefined },
    };
  }

  /**
   * A form's spell lists and save, the view's: refused when it names a list twice (by its source's id and its copy's).
   */
  protected override resolveIds({ aptitudes, saveId }: SpellBody) {
    const listIds = this.ids.resolveAll("aptitudes", aptitudes?.map(({ id }) => id) ?? []);
    return {
      ...(aptitudes && { aptitudes: aptitudes.map((aptitude, index) => ({ ...aptitude, id: listIds[index] })) }),
      ...(saveId && { saveId: this.ids.resolve("saves", saveId) }),
    };
  }

  /**
   * What saving a spell writes beside its row (`spell`: the one edited): the feats of its grouping (a spell's school:
   * its Spell Focus) when it comes to one, by the fields its form gives over those it keeps. A form that gives none of
   * its fields makes none.
   */
  protected override writesOf(_body: SpellBody, given: Partial<SpellFieldValues>, spell?: Spell): EntityWrites {
    const fields = this.formFields(given, spell);
    if (!fields) return {};
    const grouping = getGrouping(fields);
    const before = spell && getGrouping(this.fieldsOf(spell));
    return {
      made: grouping !== null && grouping !== before ? this.spellFocus.make(grouping) : [],
    };
  }
}
