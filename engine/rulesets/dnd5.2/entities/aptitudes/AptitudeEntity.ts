/** An aptitude as a ruleset's entity: what its rules refuse of an edit. */

import { z } from "zod";

import { RulesetEntity } from "@/engine/core/entities/index.ts";
import { FieldCodec } from "@/engine/core/fields/index.ts";
import type { Dnd52Kinds } from "@/engine/rulesets/dnd5.2/view/rows.ts";

/**
 * An aptitude as the ruleset has it: a pool its feats are picked in, or a spell list. No pool's name is one the rules
 * count on: a generated feat's pool missing, a skill makes none (`GeneratedFeats`).
 */
export default class AptitudeEntity extends RulesetEntity<Dnd52Kinds, "aptitudes"> {
  /** Its list's filters: a kind's pools (`scope`: the feats', the spells' lists). */
  protected static override readonly listFilters = { scope: z.enum(["feats", "spells"]) };

  /** None of its own. */
  protected override readonly fields = FieldCodec.NONE;

  override readonly type = "aptitudes";

  /**
   * A page of the ruleset's aptitudes: a kind's pools when its query says (`scope`: the feats', the spells' lists, those
   * their `listedIn` links name).
   */
  protected override listOf({ scope, ...where }: { childOnly?: boolean; scope?: "feats" | "spells" }) {
    const list = super.listOf(where);
    const linkedBy = scope && { fromType: scope, role: "listedIn" };
    return { ...list, filters: linkedBy ? { ...list.filters, linkedBy } : list.filters };
  }
}
