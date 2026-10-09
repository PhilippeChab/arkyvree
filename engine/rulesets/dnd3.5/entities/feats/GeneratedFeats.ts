import type { GeneratedFeat, GeneratedFeatRemoval } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";

/** The feats a save makes or removes with an entity, as the ruleset's view has them: made in its general feats' pool. */
export default class GeneratedFeats {
  /**
   * The general feats a save makes: none when the ruleset has no general feats' pool, or when its view shows a feat
   * named `unlessPresent` (its own or its chain's; one it deleted, a tombstone hides, doesn't count).
   */
  static make(view: RulesetView, feats: Omit<GeneratedFeat, "aptitudeId">[], unlessPresent?: string): GeneratedFeat[] {
    const { rulesetData } = view;
    const aptitudeId = rulesetData.aptitudeIdBySlug.get(LevelRules.GENERAL_FEATS_APTITUDE_SLUG);
    if (!aptitudeId || rulesetData.feats.some((feat) => feat.name === unlessPresent)) return [];
    return feats.map((feat) => ({ ...feat, aptitudeId }));
  }

  /** The generated feat named `name` a save removes, refused (`inUse`) while picked: none when the view has none. */
  static remove(view: RulesetView, name: string, inUse: string) {
    const feat = view.rulesetData.feats.find((f) => f.name === name);
    const removal: GeneratedFeatRemoval[] = feat ? [{ featId: feat.id, inUse }] : [];
    return removal;
  }
}
