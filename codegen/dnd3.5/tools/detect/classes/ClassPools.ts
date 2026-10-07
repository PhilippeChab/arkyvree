import { getFeatureBaseName, normalizeFeatureName } from "@/codegen/dnd3.5/tools/text/names.ts";
import { normalizeWs } from "@/codegen/dnd3.5/tools/text/scrapedText.ts";
import { type ClassReference } from "@/codegen/dnd3.5/tools/types/classes.ts";
import { type NamedText } from "@/codegen/dnd3.5/tools/types/reference.ts";
import { stripSeparators } from "@/shared/text.ts";

import type { BaseClassDetector } from "./BaseClassDetector.ts";
import { FeatureText } from "./FeatureText.ts";

/** A pool's aptitude, the level it opens at, and whether its picks stack. */
export type PoolAptitude = { aptitude: string; level: number; stackable?: true };

/**
 * A class's pools: the features of its aptitude picks whose description offers a choice, each with its aptitude
 * ("<Class> <Feature>") and its sub-options, the ones its description lists (inline), or else the separate features
 * that follow it (orphans: a stonelord's Stone Power's).
 */
export class ClassPools {
  constructor(
    private readonly detector: BaseClassDetector,
    private readonly detected: ClassReference["detected"],
  ) {
    this.detectPools();
    this.detectOrphanSubOptions();
  }

  /** The pool features, lowercased: their sub-options are features, not they. */
  private readonly featureNames = new Set<string>();
  /** Each pool's aptitude by its inline sub-option's name. */
  private readonly optionAptitudes = new Map<string, PoolAptitude>();
  /** Each pool's sub-options as separate features, by the pool's lowercased name. */
  private readonly orphans = new Map<string, NamedText[]>();
  /** Each pool's aptitude by its own lowercased name (a pool without inline sub-options too). */
  private readonly poolAptitudes = new Map<string, PoolAptitude>();

  /**
   * The orphan sub-options: the features that follow a pool without inline sub-options and that the table doesn't
   * name, two or more (a stonelord's Stone Power's), its own (`poolAptitudes`) to tell a pool by.
   */
  private detectOrphanSubOptions() {
    const { raw } = this.detector;
    // The features the table names: one that does isn't a sub-option
    const progressionFeatureNames = new Set<string>();
    for (const row of raw.progression) {
      for (const special of row.special)
        if (special) progressionFeatureNames.add(normalizeFeatureName(special).toLowerCase());
    }

    for (let i = 0; i < raw.classFeatures.length; i++) {
      const cf = raw.classFeatures[i];
      const baseName = getFeatureBaseName(cf.name);
      if (!this.poolAptitudes.has(cf.name.toLowerCase()) && !this.poolAptitudes.has(baseName.toLowerCase())) continue;

      // A pool with inline sub-options has them
      if (new FeatureText(normalizeWs(cf.description)).poolSubOptions()) continue;

      // The features that follow it, up to one the table names
      const orphans: NamedText[] = [];
      for (let j = i + 1; j < raw.classFeatures.length; j++) {
        const next = raw.classFeatures[j];
        const nextBase = getFeatureBaseName(next.name);
        const nextNorm = normalizeFeatureName(nextBase).toLowerCase();
        if (progressionFeatureNames.has(nextNorm) || progressionFeatureNames.has(nextBase.toLowerCase())) break;
        // "Weapon and Armor Proficiency" isn't a sub-option
        if (nextBase.toLowerCase() === "weapon and armor proficiency") continue;
        orphans.push({ name: nextBase, description: normalizeWs(next.description) });
      }
      if (orphans.length >= 2) {
        this.orphans.set(baseName.toLowerCase(), orphans);
        this.featureNames.add(cf.name.toLowerCase());
        this.featureNames.add(baseName.toLowerCase());
      }
    }
  }

  /**
   * The pools of the class's detected aptitude picks: each pick's feature whose description offers a choice, its
   * aptitude by its own name, and by each of its inline sub-options' (which make it a pool feature).
   */
  private detectPools() {
    const { detected } = this;
    if (!detected.aptitudePicks) return;
    const { classSlug, raw } = this.detector;

    for (const pick of detected.aptitudePicks) {
      // The pick's feature, by its target's slug: "aptitudes.roguespecialability.allowed" → "specialability"
      const slugMatch = pick.target.match(/^aptitudes\.(.+)\.allowed$/);
      if (!slugMatch) continue;
      const pickSlug = slugMatch[1].replace(new RegExp(`^${classSlug}`), "");
      const occ = detected.featureOccurrences.find((fo) => stripSeparators(fo.name) === pickSlug);
      if (!occ) continue;
      const cf = this.detector.findFeature(occ.name);
      if (!cf) continue;

      // A pool offers a choice
      const text = new FeatureText(normalizeWs(cf.description));
      if (!text.offersChoice()) continue;

      const aptName = `${raw.name} ${occ.name}`;
      const minLevel = Math.min(...occ.levels);

      // Its inline sub-options make it a pool feature; a pool without them may have orphans (`detectOrphanSubOptions`)
      const parsed = text.poolSubOptions();
      if (parsed) {
        for (const opt of parsed.options) {
          this.optionAptitudes.set(opt.name, {
            aptitude: aptName,
            level: minLevel,
            ...(opt.stackable ? { stackable: true } : {}),
          });
        }
        this.featureNames.add(cf.name.toLowerCase());
        this.featureNames.add(occ.name.toLowerCase());
      }
      this.poolAptitudes.set(cf.name.toLowerCase(), { aptitude: aptName, level: minLevel });
    }
  }

  /** Whether a feature (by its base name) is a pool's orphan sub-option, which its pool adds. */
  isOrphan(baseName: string): boolean {
    return [...this.orphans.values()].some((orphans) =>
      orphans.some((o) => o.name.toLowerCase() === baseName.toLowerCase()),
    );
  }

  /** Whether a feature (by its name or its base name) is a pool's: its sub-options are features, not it. */
  isPool(name: string, baseName: string): boolean {
    return this.featureNames.has(name.toLowerCase()) || this.featureNames.has(baseName.toLowerCase());
  }

  /** The aptitude an inline sub-option (by its name) belongs to. */
  optionAptitude(name: string): PoolAptitude | undefined {
    return this.optionAptitudes.get(name);
  }

  /** A pool's orphan sub-options, by its base name. */
  orphansOf(baseName: string): NamedText[] | undefined {
    return this.orphans.get(baseName.toLowerCase());
  }

  /** A pool's own aptitude, by its feature's name. */
  poolAptitude(name: string): PoolAptitude | undefined {
    return this.poolAptitudes.get(name.toLowerCase());
  }
}
