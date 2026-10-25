import type { CharacterInput } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import { FEAT_FIELDS } from "@/engine/rulesets/dnd3.5/entities/feats/fields.ts";
import type { SpellPickQuery } from "@/engine/rulesets/dnd3.5/levelUp/requests.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { SPELL_SCHOOL } from "@/vocabulary/dnd3.5/fields/index.ts";

import LevelPicker from "./LevelPicker.ts";

/**
 * A spell picker for the character, from its rows: the pool's spells (`filters`: of a spell level, when given), but
 * those it knows in the pool at any of its levels, a later one and a planned one too (`holder`: picked, granted by its
 * class levels, the one it's taking too, or made known by its modifiers, the feats' and spells' picked so far too:
 * each pool is a list of its own, which knows a spell once), those of the schools a wizard's specialization prohibits,
 * and those picked so far, in any pool.
 */
export default class SpellPicker extends LevelPicker {
  constructor(view: RulesetView, input: CharacterInput, query: SpellPickQuery) {
    super(view, input, query);
    this.filters = this.buildFilters(query);
  }

  /** What the picker offers, and what it leaves out. */
  override readonly filters: { excludeIds: string[]; ids: string[] };

  /** What the picker offers and leaves out (`filters`). */
  private buildFilters({ aptitudeId, planned = {}, spellLevel }: SpellPickQuery) {
    // Every level the character has and plans, the one it's taking too, whose grants it holds in their pools
    const known = this.holder.getHeldSpells().filter((spell) => spell.aptitudeId === aptitudeId);
    const excludeIds = [
      ...known.map((spell) => spell.id),
      ...this.getProhibitedSpellIds(aptitudeId),
      ...(planned.spellPicks ?? []).map((pick) => pick.spellId),
    ];
    return { ids: Dnd35View.of(this.rulesetData).listSpellIds({ aptitudeId, level: spellLevel }), excludeIds };
  }

  /** The wizard's spells of the schools its specialization prohibits: none for another pool. */
  private getProhibitedSpellIds(aptitudeId: string): string[] {
    const aptitude = Dnd35View.of(this.rulesetData).aptitudesById.get(aptitudeId);
    if (aptitude?.name !== "Wizard Spells") return [];

    const prohibitedSchools = new Set(
      this.character
        .getHeldFeats()
        .flatMap((feat) => FEAT_FIELDS.read(this.rulesetData.valuesOf(feat.id)).prohibitedSchools),
    );
    // The spells of each school, by the view's kind-wide values
    const spellIdsBySchool = new Map(
      this.rulesetData
        .kindValues("spells")
        .flatMap(({ entityIds, field, value }) => (field === SPELL_SCHOOL ? [[value, entityIds] as const] : [])),
    );
    const excludedSpellIds = new Set<string>();
    for (const school of prohibitedSchools)
      for (const id of spellIdsBySchool.get(school) ?? []) excludedSpellIds.add(id);

    return [...excludedSpellIds];
  }
}
