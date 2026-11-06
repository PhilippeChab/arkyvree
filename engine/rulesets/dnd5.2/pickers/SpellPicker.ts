import type { CharacterInput } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { SpellPickQuery } from "@/engine/rulesets/dnd5.2/levelUp/requests.ts";
import Dnd52View from "@/engine/rulesets/dnd5.2/view/Dnd52View.ts";

import LevelPicker from "./LevelPicker.ts";

/**
 * A spell picker for the character, from its rows: the pool's spells (`filters`: at a spell level, when given, those
 * its room takes, as the 2024 rules prepare spells: a cantrip's room cantrips alone, room past cantrips a spell of any
 * level up to the highest the pool has room at, as the character projected to the level has it, the levels planned
 * before it included), but those it knows in the pool at any of its levels, a later one and a planned one too (`holder`: picked,
 * granted by its class levels, the one it's taking too, or made known by its modifiers, the feats' and spells' picked
 * so far too: each pool is a list of its own, which knows a spell once), and those picked so far, in any pool.
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
    const known = this.holder.getHeldSpells().filter((spell) => spell.viaId === aptitudeId);
    const excludeIds = [
      ...known.map(({ entity }) => entity.id),
      ...(planned.picks ?? []).flatMap(({ entityId, step }) => (step === "spells" ? [entityId!] : [])),
    ];
    const dnd52 = Dnd52View.of(this.rulesetData);
    const listId = this.rulesetData.canonicalize(aptitudeId);
    const listed = dnd52.listSpellIds({ toId: aptitudeId });
    // Room past cantrips takes a spell of any level up to the highest the pool has room at, as the level projects it
    const highest = spellLevel ? this.character.components.aptitudes.getHighestRoomLevel(listId) : 0;
    const ids =
      spellLevel === undefined
        ? listed
        : listed.filter((spellId) => {
            const level = dnd52.listLinksOf(spellId).find((link) => link.toId === listId)?.tier;
            return level != null && (spellLevel === 0 ? level === 0 : level >= 1 && level <= highest);
          });
    return { ids, excludeIds };
  }
}
