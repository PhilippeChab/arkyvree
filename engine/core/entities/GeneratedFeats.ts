import type { EntityRemoval, MadeEntity } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";

/** A feat a plan makes with an entity: its name and description, its customizations. */
export type GeneratedFeat = Pick<MadeEntity, "modifiers" | "properties" | "requirements"> & {
  description: string;
  name: string;
};

/**
 * A set of feats an entity brings, generated in the pool a ruleset names (`poolSlug`: 3.5's general feats'): what a
 * name brings (`featsOf`, a skill's, a school's), made with the entity's plan (`make`), and removed with it by a set
 * that removes its feats (`removeFeat`, which a set exposes when it does).
 */
export default abstract class GeneratedFeats {
  constructor(protected readonly view: RulesetView) {}

  /** The pool the set's feats go in, by its slug. */
  protected abstract readonly poolSlug: string;

  /** The feats `name` brings, the first its key: the set is made unless the view has a feat of its name. */
  protected abstract featsOf(name: string): GeneratedFeat[];

  /** The generated feat named `featName` a plan removes, refused (`inUse`) while picked: none when the view has none. */
  protected removeFeat(featName: string, inUse: string) {
    const feat = this.view.rulesetData.feats.find((f) => f.name === featName);
    const removal: EntityRemoval[] = feat ? [{ id: feat.id, inUse, type: "feats" }] : [];
    return removal;
  }

  /**
   * The feats `name` brings, as entities a plan makes in the set's pool: none when the ruleset has no such pool, or
   * when its view shows the set's key feat (its own or its chain's; one it deleted, a tombstone hides, doesn't count).
   */
  make(name: string): MadeEntity[] {
    const { rulesetData } = this.view;
    const feats = this.featsOf(name);
    const aptitudeId = rulesetData.aptitudeIdBySlug.get(this.poolSlug);
    if (!aptitudeId || rulesetData.feats.some((feat) => feat.name === feats[0]?.name)) return [];
    return feats.map(({ description, modifiers, name: featName, properties, requirements }) => ({
      columns: { description, generated: true, name: featName },
      links: [{ aptitudeId }],
      modifiers,
      properties,
      requirements,
      type: "feats",
    }));
  }
}
