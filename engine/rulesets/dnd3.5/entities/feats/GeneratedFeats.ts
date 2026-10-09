import type { EntityRemoval, MadeEntity } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";

/** A feat a save makes with an entity: its name and description, its customizations. */
type GeneratedFeat = Pick<MadeEntity, "modifiers" | "properties" | "requirements"> & {
  description: string;
  name: string;
};

/**
 * The feats a save makes or removes with an entity, as the ruleset's view has them: generated, in its general feats'
 * pool, as entities its save makes (`MadeEntity`) or removes (`EntityRemoval`).
 */
export default class GeneratedFeats {
  /**
   * The general feats a save makes: none when the ruleset has no general feats' pool, or when its view shows a feat
   * named `unlessPresent` (its own or its chain's; one it deleted, a tombstone hides, doesn't count).
   */
  static make(view: RulesetView, feats: GeneratedFeat[], unlessPresent?: string): MadeEntity[] {
    const { rulesetData } = view;
    const aptitudeId = rulesetData.aptitudeIdBySlug.get(LevelRules.GENERAL_FEATS_APTITUDE_SLUG);
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

  /** The generated feat named `name` a save removes, refused (`inUse`) while picked: none when the view has none. */
  static remove(view: RulesetView, name: string, inUse: string) {
    const feat = view.rulesetData.feats.find((f) => f.name === name);
    const removal: EntityRemoval[] = feat ? [{ id: feat.id, inUse, type: "feats" }] : [];
    return removal;
  }
}
