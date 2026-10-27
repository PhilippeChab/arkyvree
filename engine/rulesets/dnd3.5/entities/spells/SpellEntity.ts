/** A spell as a ruleset's entity: what the ruleset lists it by, and what its form writes, checked. */

import { z } from "zod";

import type { FormBody } from "@/engine/core/entities/index.ts";
import type { PartialFieldValues } from "@/engine/core/fields/index.ts";
import type { EntityRecord, EntityWrites } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import SpellFocusFeats from "@/engine/rulesets/dnd3.5/entities/feats/SpellFocusFeats.ts";
import ListedEntity from "@/engine/rulesets/dnd3.5/entities/ListedEntity.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/dnd3.5/limits.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Spell } from "@/engine/rulesets/dnd3.5/view/rows.ts";

import { SPELL_FIELDS } from "./fields.ts";

/** A spell's level: 0 to the rules' last. */
const SPELL_LEVEL = z.number().int().min(0).max(RULESET_LIMITS.spellLevel);

/** A spell's grouping, which its feats go by: its school, none without one. */
function getGrouping(fields: PartialFieldValues<typeof SPELL_FIELDS.fields>) {
  return typeof fields.school === "string" && fields.school.length > 0 ? fields.school : null;
}

/** A spell as the ruleset has it: listed by pool and spell level, saved by its rules with its fields and its feats. */
export default class SpellEntity extends ListedEntity<"spells", typeof SPELL_FIELDS.fields> {
  /** Its list narrows by a spell level (its `listedIn` links' `tier`). */
  protected static override readonly levels = true;

  /** The Spell Focus feats a spell's school brings. */
  private readonly spellFocus = new SpellFocusFeats(this.view);

  /** Its spell lists at their levels, its school, components, range…, its saving throw and what a save does. */
  protected override readonly fields = SPELL_FIELDS;

  protected override readonly label = "Spell";

  override readonly type = "spells";

  /**
   * Refuses a spell linked to a pool the view's feats use (its fields refuse a new one without a pool, and a pool's
   * spell level past the rules' bounds).
   */
  protected override checkForm(body: FormBody) {
    const listIds = (this.listsOf(body) ?? []).map((list) => list.toId);
    const message = "Cannot link spell to aptitude(s) already used for feats";
    this.refuseLists(listIds, Dnd35View.of(this.rulesetData).aptitudeIdsWithFeats, message);
  }

  /** The pools a form links the spell to, each at its spell level, none without one (none: an edit's kept). */
  protected override linksOf(body: FormBody) {
    return super
      .linksOf(body)
      ?.map((set) => ({ ...set, links: set.links.map(({ tier, toId }) => ({ tier: tier ?? null, toId })) }));
  }

  /**
   * A page of the ruleset's spells, as its query asks for it: what it's read with (`filters`: a list's spells, at a level
   * when one is given), and its records described, with their links as the ruleset composes them. Refused at a level past
   * the rules' bounds.
   */
  protected override listOf(where: { listedIn?: string; tier?: number }) {
    const { listedIn, tier } = where;
    RulesError.parse(SPELL_LEVEL.optional(), tier, ["tier"]);
    const listed = listedIn !== undefined || tier != null;
    return {
      describe: <T extends Pick<EntityRecord, "fields" | "id" | "links">>(rows: T[]) => this.describeListed(rows),
      filters: {
        ids: listed ? Dnd35View.of(this.rulesetData).listSpellIds({ aptitudeId: listedIn, level: tier }) : undefined,
      },
    };
  }

  /**
   * What saving a spell writes beside its row (`spell`: the one edited): the feats of its grouping (a spell's school:
   * its Spell Focus) when it comes to one, by the fields its form gives over those it keeps. A form that gives none of
   * its fields makes none.
   */
  protected override writesOf(
    _body: FormBody,
    given: PartialFieldValues<typeof SPELL_FIELDS.fields>,
    spell?: Spell,
  ): EntityWrites {
    const fields = this.formFields(given, spell);
    if (!fields) return {};
    const grouping = getGrouping(fields);
    const before = spell && getGrouping(this.fieldsOf(spell));
    return {
      made: grouping !== null && grouping !== before ? this.spellFocus.make(grouping) : [],
    };
  }
}
