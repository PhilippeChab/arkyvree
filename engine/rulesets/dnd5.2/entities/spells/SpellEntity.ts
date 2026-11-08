/** A spell as a ruleset's entity: what the ruleset lists it by, and what its form writes, checked. */

import { z } from "zod";

import type { FormBody } from "@/engine/core/entities/index.ts";
import type { EntityRecord } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import ListedEntity from "@/engine/rulesets/dnd5.2/entities/ListedEntity.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/dnd5.2/limits.ts";
import Dnd52View from "@/engine/rulesets/dnd5.2/view/Dnd52View.ts";

import { SPELL_FIELDS } from "./fields.ts";

/** A spell as the ruleset has it: listed by pool and spell level, saved by its rules with its fields. */
export default class SpellEntity extends ListedEntity<"spells", typeof SPELL_FIELDS.fields> {
  /** Its list narrows by a spell level (its `listedIn` links' `tier`). */
  protected static override readonly tiered = true;

  /** A spell's level on a list: 0 to the rules' last, as its list's filter and a class's list's add read it. */
  static readonly level = z.number().int().min(0).max(RULESET_LIMITS.spellLevel);

  /** Its spell lists at their levels, its school, casting time, range, components, duration, and its saving throw. */
  protected override readonly fields = SPELL_FIELDS;

  override readonly type = "spells";

  /**
   * Refuses a spell linked to a pool the view's feats use (its fields refuse a new one without a pool, and a pool's
   * spell level past the rules' bounds).
   */
  protected override checkForm(body: FormBody) {
    const listIds = (this.listsOf(body) ?? []).map((list) => list.toId);
    const message = "Cannot link spell to aptitude(s) already used for feats";
    this.refuseLists(listIds, Dnd52View.of(this.rulesetData).aptitudeIdsWithFeats, message);
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
    RulesError.parse(SpellEntity.level.optional(), tier, ["tier"]);
    const listed = listedIn !== undefined || tier != null;
    return {
      describe: <T extends Pick<EntityRecord, "fields" | "id" | "links">>(rows: T[]) => this.describeListed(rows),
      filters: {
        ids: listed ? Dnd52View.of(this.rulesetData).listSpellIds({ toId: listedIn, tier }) : undefined,
      },
    };
  }
}
