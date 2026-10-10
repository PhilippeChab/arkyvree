import type { EntityRemoval, MadeEntity } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";

/** A feat a plan makes with an entity: its name and description, its customizations. */
type GeneratedFeat = Pick<MadeEntity, "modifiers" | "properties" | "requirements"> & {
  description: string;
  name: string;
};

/**
 * The feats a plan makes or removes with an entity, as the ruleset's view has them: generated, in the pool a ruleset
 * names (`poolSlug`: 3.5's general feats'), as entities its plan makes (`MadeEntity`) or removes (`EntityRemoval`).
 */
export default class GeneratedFeats {
  /**
   * The feats a plan makes in the pool of `poolSlug`: none when the ruleset has no such pool, or when its view shows a
   * feat named `unlessPresent` (its own or its chain's; one it deleted, a tombstone hides, doesn't count).
   */
  static make(view: RulesetView, poolSlug: string, feats: GeneratedFeat[], unlessPresent?: string): MadeEntity[] {
    const { rulesetData } = view;
    const aptitudeId = rulesetData.aptitudeIdBySlug.get(poolSlug);
    if (!aptitudeId || rulesetData.feats.some((feat) => feat.name === unlessPresent)) return [];
    return feats.map(({ description, modifiers, name, properties, requirements }) => ({
      columns: { description, generated: true, name },
      links: [{ aptitudeId }],
      modifiers,
      properties,
      requirements,
      type: "feats",
    }));
  }

  /** The generated feat named `name` a plan removes, refused (`inUse`) while picked: none when the view has none. */
  static remove(view: RulesetView, name: string, inUse: string) {
    const feat = view.rulesetData.feats.find((f) => f.name === name);
    const removal: EntityRemoval[] = feat ? [{ id: feat.id, inUse, type: "feats" }] : [];
    return removal;
  }
}
