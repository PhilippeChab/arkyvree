import { LevelSelections } from "@/engine/core/levelUp/index.ts";
import FeatEntity, { type PoolModifier } from "@/engine/rulesets/dnd3.5/entities/feats/FeatEntity.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";

/** A 3.5 character's saved level's selections: each feat it picked with the pools its modifiers add slots to. */
export default class Dnd35LevelSelections extends LevelSelections<
  DetailedCharacter,
  { aptitudeModifiers: PoolModifier[] }
> {
  /** The pools each picked feat's modifiers add slots to. */
  protected override featDetailsOf(featIds: string[]) {
    const pools = new FeatEntity(this.view).describePoolModifiers(featIds);
    return (featId: string) => ({ aptitudeModifiers: pools.get(featId) ?? [] });
  }
}
