import { normalizeWs } from "@/codegen/core/text/whitespace.ts";
import { BenefitModifiers } from "@/codegen/dnd3.5/tools/detect/readers/modifiers/BenefitModifiers.ts";
import { ProficiencyModifiers } from "@/codegen/dnd3.5/tools/detect/readers/modifiers/ProficiencyModifiers.ts";
import { getFeatureBaseName, isPluralVariantOf, isVariantOf } from "@/codegen/dnd3.5/tools/text/names.ts";
import { type AptitudePick, type ClassReference } from "@/codegen/dnd3.5/tools/types/classes.ts";
import { bonus } from "@/content/core/builders/customization/modifiers.ts";
import { stripSeparators } from "@/shared/text.ts";

import type { BaseClassDetector, ClassFeature } from "./BaseClassDetector.ts";
import { ClassPools } from "./ClassPools.ts";
import { FeatureText } from "./FeatureText.ts";

/** Its detected aptitude picks, an override's for the same aptitude replacing a detected one. */
function mergeAptitudePicks(detected?: AptitudePick[], overrides?: AptitudePick[]): AptitudePick[] | undefined {
  if (!overrides) return detected;
  if (!detected) return overrides;
  const overrideTargets = new Set(overrides.map((p) => p.target));
  return [...detected.filter((p) => !overrideTargets.has(p.target)), ...overrides];
}

/**
 * A class reference's mapping, built step by step from what its detector read: its features (a pool's sub-options for
 * a pool, `ClassPools`), the aptitude picks they own, and its spells; its overrides applied, and each occurrence its
 * table names mapped to its feature.
 */
export class ClassMapping {
  constructor(
    private readonly detector: BaseClassDetector,
    private readonly detected: ClassReference["detected"],
  ) {
    this.pools = new ClassPools(detector, detected);
  }

  /** The mapping's features, by name. */
  private readonly features: ClassReference["mapping"]["features"] = {};
  /** The class's pools and their sub-options. */
  private readonly pools: ClassPools;

  /**
   * Add aptitude pick modifiers to features that have matching picks (e.g. Fighter's "Bonus Feats", Rogue's "Special
   * Abilities"). The feat owns the modifier; aptitudePicks that duplicate these are stripped when the class's seed is built.
   */
  private addAptitudePickModifiers() {
    const { detected } = this;
    if (!detected.aptitudePicks) return;
    const { classSlug } = this.detector;
    for (const pick of detected.aptitudePicks) {
      const slugMatch = pick.target.match(/^aptitudes\.(.+)\.allowed$/);
      if (!slugMatch) continue;
      const pickSlug = slugMatch[1];

      // Find the feature whose name matches this pick slug
      for (const [key, feat] of Object.entries(this.features)) {
        // Skip features that already have an aptitude pick modifier
        if (feat.modifiers?.some((m) => m.target === pick.target)) continue;

        const keySlug = stripSeparators(key);
        const featureSlug = `${classSlug}${keySlug}`;
        // Match with class prefix (per-class aptitude) OR direct (shared
        // aptitude — slug doesn't start with classSlug, e.g.
        // aptitudes.favoredenemy.allowed). The shared branch is gated on
        // the prefix check to avoid matching "combatstyle" across classes.
        const matches =
          isPluralVariantOf(pickSlug, featureSlug) ||
          (!pickSlug.startsWith(classSlug) && isPluralVariantOf(pickSlug, keySlug));
        if (matches) {
          // If per-level bonusFeatLists exist for this pick, the feat will be split
          // into per-level variants — don't mark stackable (e.g. Monk Bonus Feat).
          // Otherwise keep the auto-detected stackable (e.g. Fighter Bonus Feats).
          const hasPerLevelLists = detected.bonusFeatLists?.some(
            (l) => l.levels && l.levels.some((lv) => pick.levels.includes(lv)),
          );
          if (hasPerLevelLists) feat.stackable = undefined;
          // Add the aptitude pick modifier
          if (!feat.modifiers) feat.modifiers = [];
          feat.modifiers.push(bonus(pick.target, 1));
          break;
        }
      }
    }
  }

  /**
   * A feature, at the level its occurrences in the progression first give it (its variants' too: "Bear Form
   * (Black)", "1st Favored Enemy"), stackable when it occurs more than once, with the modifiers its text gives.
   */
  private addFeature(cf: ClassFeature, baseName: string) {
    const { raw, detected } = this;
    // Find occurrences for this feature
    const baseNameLower = baseName.toLowerCase();
    const baseWords = new Set(baseNameLower.split(/\s+/));
    const occ =
      detected.featureOccurrences.find((fo) => fo.name.toLowerCase() === baseNameLower) ??
      // Substring containment: occurrence contains feature name or vice versa
      // Handles ordinal prefix ("1st Favored Enemy"), frequency suffix ("Remove Disease 1/Week"),
      // variant suffix ("Bear Form (Black)"), level suffix ("Song Of Celerity (2nd)"),
      // class suffix ("Fiendslaying (Knight Of The Chalice)")
      detected.featureOccurrences.find(
        (fo) => fo.name.toLowerCase().includes(baseNameLower) || baseNameLower.includes(fo.name.toLowerCase()),
      ) ??
      // Word-subset: all words of one name appear in the other
      // Handles extra-word mismatches like "Save Against Poison" vs "Save Bonus against Poison"
      detected.featureOccurrences.find((fo) => {
        const foWords = new Set(fo.name.toLowerCase().split(/\s+/));
        return [...foWords].every((w) => baseWords.has(w)) || [...baseWords].every((w) => foWords.has(w));
      });
    // Collect variant occurrences: same feature appearing at multiple levels under different names
    // Match only true variants (suffix/prefix patterns), not unrelated features containing the name
    // e.g. "Bear Form (Black)" is a variant of "Bear Form", but "Improved Evasion" is NOT a variant of "Evasion"
    const variantOccs = detected.featureOccurrences.filter(
      (fo) => fo !== occ && isVariantOf(fo.name.toLowerCase(), baseNameLower),
    );
    // Stackable if single occurrence spans multiple levels OR total occurrences > 1
    const totalOccurrences = (occ ? 1 : 0) + variantOccs.length;
    const stackable = (occ && occ.levels.length > 1) || totalOccurrences > 1 ? true : undefined;

    // Detect spell feature level from spell table (first non-empty row)
    const spellFeatureLevel =
      /^spells$/i.test(baseName) && detected.spellsPerDay
        ? detected.spellsPerDay.findIndex((row) => row.length > 0) + 1
        : 0;

    // Use occ's levels if found, otherwise union of all variant occurrence levels
    const allLevels = occ
      ? [...occ.levels, ...variantOccs.flatMap((vo) => vo.levels)]
      : variantOccs.flatMap((vo) => vo.levels);
    const level = allLevels.length > 0 ? Math.min(...allLevels) : spellFeatureLevel || 1; // Features not in progression table are available from level 1

    const normalizedDesc = normalizeWs(cf.description);
    const { modifiers } = new BenefitModifiers(normalizedDesc);
    const wapMods =
      baseName === "Weapon and Armor Proficiency" ? new ProficiencyModifiers(normalizedDesc).modifiers : [];
    const allModifiers = [...wapMods, ...modifiers];

    this.features[baseName] = {
      seedName: `${baseName} (${raw.name})`,
      description: normalizedDesc,
      level,
      stackable,
      ...(allModifiers.length > 0 ? { modifiers: allModifiers } : {}),
    };
  }

  /**
   * A pool feature: itself, at the level it first occurs (no aptitude pick modifier here — aptitudePicks already
   * handles it at runtime), and its sub-options, each a selectable feature of its aptitude: its description's, or
   * else the separate features (or table rows) that follow it.
   */
  private addPoolFeature(cf: ClassFeature, baseName: string) {
    const { raw, detected } = this;
    const normalizedDesc = normalizeWs(cf.description);
    const baseSlug = stripSeparators(baseName);
    const poolOcc = detected.featureOccurrences.find((fo) => isPluralVariantOf(baseSlug, stripSeparators(fo.name)));
    const poolLevel = poolOcc ? Math.min(...poolOcc.levels) : 1;
    const poolStackable = poolOcc && poolOcc.levels.length > 1 ? true : undefined;

    this.features[baseName] = {
      seedName: `${baseName} (${raw.name})`,
      description: normalizedDesc,
      level: poolLevel,
      ...(poolStackable ? { stackable: true } : {}),
    };
    const parsed = new FeatureText(normalizedDesc).poolSubOptions();
    if (parsed) {
      for (const opt of parsed.options) {
        const pool = this.pools.optionAptitude(opt.name);
        if (!pool) continue;
        this.features[opt.name] = {
          description: opt.description,
          aptitude: pool.aptitude,
          selectable: true,
          ...(pool.stackable ? { stackable: true } : {}),
          level: pool.level,
        };
      }
    }

    // Fallback: orphan sub-options (separate classFeature entries)
    const orphans = this.pools.orphansOf(baseName);
    if (!orphans) return;
    const poolInfo = this.pools.poolAptitude(baseName) ?? this.pools.poolAptitude(cf.name);
    if (!poolInfo) return;
    for (const orphan of orphans) {
      this.features[orphan.name] = {
        description: orphan.description,
        aptitude: poolInfo.aptitude,
        selectable: true,
        level: poolInfo.level,
      };
    }
  }

  /**
   * Its overrides of its spells: none of its own (`noSpells`), the fields of its spells (`spells`) and its bonus spells'
   * ability; and each feature's fields (a `null` one removes the detected).
   */
  private applyOverrides(mapping: ClassReference["mapping"]) {
    const { overrides } = this.detector.stored;
    if (overrides?.noSpells) {
      delete mapping.spells;
      delete mapping.bonusSpellAbility;
    }
    if (mapping.spells && overrides?.spells) mapping.spells = { ...mapping.spells, ...overrides.spells };
    const bonusSpellAbility = overrides?.bonusSpellAbility ?? mapping.bonusSpellAbility;
    if (bonusSpellAbility !== undefined) mapping.bonusSpellAbility = bonusSpellAbility;
    for (const [name, fields] of Object.entries(overrides?.features ?? {})) {
      const feature = Object.assign(mapping.features[name] ?? {}, fields);
      for (const [key, value] of Object.entries(feature)) if (value === null) Reflect.deleteProperty(feature, key);
      mapping.features[name] = feature;
    }
  }

  /**
   * Each occurrence the table names, by the feature it is: the one it names, one of its aliases, a variant of it, its
   * plural or singular, or a feature whose name starts with it ("Rage +" for "Rage +1/Day").
   */
  private occurrenceMap(features: ClassReference["mapping"]["features"]): Record<string, string> {
    const occurrenceMap: Record<string, string> = {};

    for (const [key, feat] of Object.entries(features)) {
      const keyLower = key.toLowerCase();
      const aliasLower = new Set(feat.aliases?.map((a) => a.toLowerCase()) ?? []);

      for (const fo of this.detected.featureOccurrences) {
        if (fo.name in occurrenceMap) continue;
        const foLower = fo.name.toLowerCase();
        // Direct match
        if (foLower === keyLower) {
          occurrenceMap[fo.name] = key;
          continue;
        }
        // Alias match
        if (aliasLower.has(foLower)) {
          occurrenceMap[fo.name] = key;
          continue;
        }
        // Variant: a suffix ("(Magic)", "Any Distance") or an ordinal ("1st Favored Enemy" → "Favored Enemy")
        if (isVariantOf(foLower, keyLower)) {
          occurrenceMap[fo.name] = key;
          continue;
        }
        // Plural match ("Bonus Feat" ↔ "Bonus Feats")
        if (isPluralVariantOf(keyLower, foLower)) {
          occurrenceMap[fo.name] = key;
          continue;
        }
        // Key starts with occurrence name (occurrence is a truncated version of key)
        // Handles "Rage +" matching "Rage +1/Day"
        if (keyLower.startsWith(foLower)) {
          occurrenceMap[fo.name] = key;
          continue;
        }
      }
    }

    return occurrenceMap;
  }

  /**
   * The class's fields its overrides can set, each its override's, else as detected or scraped: its summary, its
   * caster type, its aptitude picks (the detected ones an override's for the same aptitude replaces), its bonus feat
   * lists; and what only an override gives (its free feats, its proficiencies, its level modifiers and the table columns
   * they're read from, its skip).
   */
  private overriddenFields(): Omit<
    ClassReference["mapping"],
    "bonusSpellAbility" | "classFeatureAptitude" | "features" | "occurrenceMap" | "spells"
  > {
    const overrides = this.detector.stored.overrides ?? {};
    const { detected, raw } = this;
    const casterType = overrides.casterType ?? detected.casterType;
    const aptitudePicks = mergeAptitudePicks(detected.aptitudePicks, overrides.aptitudePicks);
    const bonusFeatLists = overrides.bonusFeatLists ?? detected.bonusFeatLists;
    return {
      bab: overrides.bab ?? detected.bab,
      saves: overrides.saves ?? detected.saves,
      classSkills: overrides.classSkills ?? raw.classSkills,
      description: overrides.description ?? raw.description,
      requirements: overrides.requirements ?? detected.requirements,
      ...(casterType ? { casterType } : {}),
      ...(aptitudePicks ? { aptitudePicks } : {}),
      ...(bonusFeatLists ? { bonusFeatLists } : {}),
      ...(overrides.freeFeats ? { freeFeats: overrides.freeFeats } : {}),
      ...(overrides.proficiencies ? { proficiencies: overrides.proficiencies } : {}),
      ...(overrides.modifiers ? { modifiers: overrides.modifiers } : {}),
      ...(overrides.columns ? { columns: overrides.columns } : {}),
      ...(overrides.skip ? { skip: true } : {}),
    };
  }

  /** What the class's page gives. */
  private get raw(): ClassReference["raw"] {
    return this.detector.raw;
  }

  /** The class's mapping: its pools and features, their aptitude picks, its spells and its bonus spells' ability. */
  build(): ClassReference["mapping"] {
    const { raw, detected } = this;
    for (const cf of raw.classFeatures) {
      const baseName = getFeatureBaseName(cf.name);

      // A pool feature adds its sub-options; an orphan sub-option is its pool's
      if (this.pools.isPool(cf.name, baseName)) {
        this.addPoolFeature(cf, baseName);
        continue;
      }
      if (this.pools.isOrphan(baseName)) continue;

      this.addFeature(cf, baseName);
    }

    this.addAptitudePickModifiers();

    const mapping: ClassReference["mapping"] = {
      classFeatureAptitude: `${raw.name} Class Feature`,
      features: this.features,
      ...this.overriddenFields(),
    };

    // Auto-populate spells from detected data
    if (detected.spellsPerDay) {
      // The aptitude "<Class> Spells" as a path names it
      const slug = `${this.detector.classSlug}spells`;
      mapping.spells = {
        slug,
        ...(!raw.hasCantrips ? { noCantrips: true } : {}),
        perDay: detected.spellsPerDay,
        ...(detected.spellsKnown ? { known: detected.spellsKnown } : { knowAll: true }),
      };
    }

    if (raw.bonusSpellAbility) mapping.bonusSpellAbility = raw.bonusSpellAbility;

    this.applyOverrides(mapping);
    mapping.occurrenceMap = this.occurrenceMap(mapping.features);
    return mapping;
  }
}
