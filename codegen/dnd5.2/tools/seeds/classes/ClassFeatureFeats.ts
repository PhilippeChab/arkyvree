import { normalizeText } from "@/codegen/dnd5.2/tools/detect/text.ts";
import { FEATURE_MODIFIERS } from "@/codegen/dnd5.2/tools/terms/classFeatures.ts";
import type { Subclass } from "@/codegen/dnd5.2/tools/types/classes.ts";
import { gte } from "@/content/core/builders/customization/requirements.ts";
import type { ModifierSeed } from "@/content/core/builders/customization/types.ts";
import { classFeatures, classSubclass } from "@/content/dnd5.2/builders/aptitudes/names.ts";
import { grantFeat } from "@/content/dnd5.2/builders/feats/possession.ts";
import type { FeatSeed } from "@/content/dnd5.2/builders/feats/types.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { stripSeparators } from "@/shared/text.ts";
import { FEATURE_FAMILIES } from "@/vocabulary/dnd5.2/feats.ts";
import { FEAT_FAMILY, FEAT_SELECTABLE, FEAT_STACKABLE } from "@/vocabulary/dnd5.2/fields/index.ts";

import type { ClassEntries } from "./ClassEntries.ts";

/**
 * A class's features as feats: each of its own a feat granted at each level that lists it, through its feature pool
 * (`classFeatures`), its subclass's placeholder past the level it's picked at left out (a subclass's own features fill
 * those levels); each subclass a feat of its subclass pool (`classSubclass`) whose modifiers grant its features' feats,
 * each from its class level on. A feature's feat is named after its class or subclass ("Rage (Barbarian)",
 * "Improved Critical (Champion)"), and its modifiers are those the terms give it (`FEATURE_MODIFIERS`).
 */
export class ClassFeatureFeats {
  constructor(private readonly entries: ClassEntries) {}

  /** A feature's feat's name, after its class or subclass: "Rage (Barbarian)". */
  static featName(feature: string, owner: string): string {
    return `${feature} (${owner})`;
  }

  /**
   * A feature's feat: its text, the pool its class's features are in, its modifiers, granted at `levels` levels, and
   * its family when a feat requires it (`FEATURE_FAMILIES`: Fighting Style, Spellcasting).
   */
  private featureFeat(feature: string, owner: string, description: string, levels: number): FeatSeed {
    const modifiers = FEATURE_MODIFIERS.filter(
      (entry) => entry.feature === feature && (entry.owner === undefined || entry.owner === owner),
    ).flatMap((entry) => entry.modifiers);
    return {
      name: ClassFeatureFeats.featName(feature, owner),
      description: normalizeText(description),
      aptitudes: [classFeatures(this.entries.name())],
      ...(modifiers.length > 0 ? { modifiers } : {}),
      fields: {
        [FEAT_SELECTABLE]: false,
        ...(levels > 1 ? { [FEAT_STACKABLE]: true } : {}),
        ...(isOneOf(feature, FEATURE_FAMILIES) ? { [FEAT_FAMILY]: [feature] } : {}),
      },
    };
  }

  /** The levels each of the class's own features is granted at, by feature, in the order they're first gained. */
  private grantedLevels(): Map<string, number[]> {
    const placeholder = classSubclass(this.entries.name());
    const granted = new Map<string, number[]>();
    for (const { features, level } of this.entries.levels()) {
      for (const { name } of features) {
        const levels = granted.get(name) ?? [];
        // A subclass's placeholder is its pick's level alone: its later levels are its subclass's features'
        if (name !== placeholder || levels.length === 0) granted.set(name, [...levels, level]);
      }
    }
    return granted;
  }

  /** A subclass's feat, in its class's subclass pool: its features' feats granted, each from its class level on. */
  private subclassFeat({ levels, subclass }: Subclass): FeatSeed {
    const classLevel = `classes.${stripSeparators(this.entries.name())}.level`;
    const modifiers: ModifierSeed[] = levels.flatMap(({ features, level }) =>
      features.map(({ name }) => ({
        ...grantFeat(ClassFeatureFeats.featName(name, subclass.name)),
        requirements: [gte(classLevel, level)],
      })),
    );
    return {
      name: subclass.name,
      description: normalizeText(subclass.description),
      aptitudes: [classSubclass(this.entries.name())],
      modifiers,
      fields: { [FEAT_FAMILY]: ["Subclass"] },
    };
  }

  /** The feats of the class's own features, each granted at each level that lists it. */
  classFeats(): FeatSeed[] {
    return [...this.grantedLevels()].map(([name, levels]) =>
      this.featureFeat(name, this.entries.name(), this.entries.feature(name).description, levels.length),
    );
  }

  /** The class's features as its seed grants them, each at each of its levels, in level order. */
  features(): [number, string][] {
    return [...this.grantedLevels()]
      .flatMap(([name, levels]) =>
        levels.map((level): [number, string] => [level, ClassFeatureFeats.featName(name, this.entries.name())]),
      )
      .sort(([a], [b]) => a - b);
  }

  /** The class's subclasses' feats, and their features' feats, each granted at the class level it's gained at. */
  subclassFeats(): FeatSeed[] {
    return this.entries.subclasses().flatMap((subclass) => {
      const granted = subclass.levels.flatMap(({ features }) => features.map(({ name }) => name));
      const features = granted.map((name) => {
        const feature = subclass.features.find((entry) => entry.name === name);
        if (!feature) throw new Error(`${subclass.subclass.name}: no feature is "${name}"`);
        const levels = granted.filter((other) => other === name).length;
        return this.featureFeat(name, subclass.subclass.name, feature.description, levels);
      });
      return [this.subclassFeat(subclass), ...new Map(features.map((feat) => [feat.name, feat])).values()];
    });
  }
}
