import { CharacterComponent } from "@/engine/core/character/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import { stripSeparators } from "@/shared/text.ts";

type FeatGroupEntry = Record<string, FeatEntry>;

type FeatsData = {
  [key: string]: FeatEntry | FeatGroupEntry;
};

export type FeatEntry = {
  count: number;
  name: string;
  possessed: boolean;
};

/** A feat's entry, not a family's group: a group's values are its feats. */
function isFeatEntry(entry: FeatEntry | FeatGroupEntry | undefined): entry is FeatEntry {
  return typeof entry?.possessed === "boolean";
}

/**
 * A character's feats: an entry for each of the ruleset's, possessed and counted when the character has it, and each
 * family's feats under its name (`injectGroupings`, by the feat groupings).
 */
export default class FeatsComponent extends CharacterComponent<LoadedCharacterData> {
  private readonly feats: FeatsData = {};

  /** An entry for each of the ruleset's feats: possessed, and counted, as many times as the character has it. */
  override initialize({ feats }: Pick<LoadedCharacterData, "feats">, { rulesetData }: RulesetView) {
    const possessedCounts = new Map<string, number>();
    for (const feat of feats) {
      const name = stripSeparators(feat.name);
      possessedCounts.set(name, (possessedCounts.get(name) ?? 0) + 1);
    }

    for (const feat of rulesetData.feats) {
      const normalizedName = stripSeparators(feat.name);
      const count = possessedCounts.get(normalizedName) ?? 0;

      this.feats[normalizedName] = {
        name: feat.name,
        possessed: count > 0,
        count,
      };
    }
  }

  /** The feat of that name: none for a family's name, whose group no feat shares. */
  getFeat(featName: string): FeatEntry | undefined {
    const entry = this.feats[stripSeparators(featName)];
    return isFeatEntry(entry) ? entry : undefined;
  }

  getFeats(): FeatsData {
    return this.feats;
  }

  /**
   * Grants the feat of that name (or slug) to a character that doesn't hold it: possessed, and counted once. False when
   * it holds it already (a pick, a grant or a modifier gave it), or the ruleset has no such feat.
   */
  grant(featName: string): boolean {
    const feat = this.getFeat(featName);
    if (!feat || feat.possessed) return false;
    feat.possessed = true;
    feat.count += 1;
    return true;
  }

  /**
   * Each family's feats under its name, so `feats.<family>.*` reaches them: the feat groupings', which hold this
   * component's own entries, so they're set up after it and fill it in turn (`FeatGroupingsComponent.initialize`). A family named like a feat ("Martial
   * Weapon Proficiency") shares the feat's key: its feats join the feat's entry, beside the feat's own fields, so
   * `feats.<name>.possessed` is the feat's and `feats.<name>.*` its family's.
   */
  injectGroupings(groupings: Record<string, Record<string, FeatEntry>>) {
    for (const [key, group] of Object.entries(groupings)) {
      const feat = this.feats[key];
      if (!feat) {
        this.feats[key] = group;
        continue;
      }
      for (const [variant, member] of Object.entries(group)) {
        // The feat itself, if it's in its own family, and a variant named like one of its fields stay out
        if (member !== feat && !(variant in feat)) (feat as FeatGroupEntry)[variant] = member;
      }
    }
  }
}
