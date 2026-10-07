import { BenefitModifiers } from "@/database/packages/dnd35-from-parser/tools/detect/readers/modifiers/BenefitModifiers.ts";
import { readProficiencyModifiers } from "@/database/packages/dnd35-from-parser/tools/detect/readers/modifiers/proficiencies.ts";
import { isPluralVariantOf } from "@/database/packages/dnd35-from-parser/tools/text/names.ts";
import { normalizeWs } from "@/database/packages/dnd35-from-parser/tools/text/scrapedText.ts";
import { type ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import { type NamedText } from "@/database/packages/dnd35-from-parser/tools/types/reference.ts";
import { bonus } from "@/database/packages/dnd35/content/customization/modifiers.ts";
import { stripSeparators } from "@/shared/text.ts";

import type { BaseClassDetector, ClassFeature } from "./BaseClassDetector.ts";
import { getFeatureBaseName, isVariantOf, normalizeFeatureName } from "./featureNames.ts";
import { CHOICE_PATTERN, readPoolSubOptions } from "./featureText.ts";

/** A pool's aptitude, the level it opens at, and whether its picks stack. */
type PoolAptitude = { aptitude: string; level: number; stackable?: true };

/**
 * A class reference's mapping, built step by step from what its detector read: its pools (features whose description
 * offers a choice) and their sub-options (inline, separate features, or a table's), its features, the aptitude picks
 * they own, and its spells; its overrides applied, and each occurrence its table names mapped to its feature.
 */
export class ClassMapping {
  constructor(
    private readonly detector: BaseClassDetector,
    private readonly detected: ClassReference["detected"],
  ) {}

  /** The mapping's features, by name. */
  private readonly features: ClassReference["mapping"]["features"] = {};

  /** Each pool sub-option's sub-options, the separate features (or table rows) that follow it, by its lowercased name. */
  private readonly orphanSubOptions = new Map<string, NamedText[]>();

  /**
   * Each pool's aptitude by its sub-option's name, and by its own as `__pool__<name>` (a pool with no inline
   * sub-options too, whose sub-options are separate features).
   */
  private readonly poolAptitudes = new Map<string, PoolAptitude>();

  /** The pool features, lowercased: their sub-options are features, not they. */
  private readonly poolFeatureNames = new Set<string>();

  /** The "table: X" features and their rows, lowercased: sub-options, not features. */
  private readonly tableSkipNames = new Set<string>();

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
    const wapMods = baseName === "Weapon and Armor Proficiency" ? readProficiencyModifiers(normalizedDesc) : [];
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
    const parsed = readPoolSubOptions(normalizedDesc);
    if (parsed) {
      for (const opt of parsed.options) {
        const pool = this.poolAptitudes.get(opt.name);
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
    const orphans = this.orphanSubOptions.get(baseName.toLowerCase());
    if (!orphans) return;
    const poolInfo =
      this.poolAptitudes.get(`__pool__${baseName.toLowerCase()}`) ??
      this.poolAptitudes.get(`__pool__${cf.name.toLowerCase()}`);
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

  /** Its overrides: no spells of its own (`noSpells`), and each feature's fields (a `null` one removes the detected). */
  private applyOverrides(mapping: ClassReference["mapping"]) {
    const { overrides } = this.detector.stored;
    if (overrides?.noSpells) {
      delete mapping.spells;
      delete mapping.bonusSpellAbility;
    }
    for (const [name, fields] of Object.entries(overrides?.features ?? {})) {
      const feature: Record<string, unknown> = Object.assign(mapping.features[name] ?? {}, fields);
      for (const [key, value] of Object.entries(feature)) if (value === null) delete feature[key];
      mapping.features[name] = feature;
    }
  }

  /** The ability the class's bonus spells come from: its own, else the one its features' text names. */
  private bonusSpellAbility(): string | undefined {
    // Auto-populate bonusSpellAbility from raw or class feature descriptions
    if (this.raw.bonusSpellAbility) return this.raw.bonusSpellAbility;
    for (const cf of this.raw.classFeatures) {
      const m =
        cf.description.match(
          /must have (?:a |an )?(Intelligence|Wisdom|Charisma) score (?:equal to )?(?:at )?least 10/i,
        ) ?? cf.description.match(/bonus spells for a high (Intelligence|Wisdom|Charisma)/i);
      if (m) return m[1];
    }
    return undefined;
  }

  /**
   * Detect orphan sub-options: classFeature entries that follow a pool parent and don't appear in the progression
   * table (e.g. Stonelord's Stone Power sub-options). Uses poolAptitudes' __pool__ entries (broader than
   * poolFeatureNames, which only has inline-sub features).
   */
  private detectOrphanSubOptions() {
    const { raw } = this;
    // Build a set of feature names that appear in the progression table
    // (used to detect "orphan" classFeature entries that are pool sub-options)
    const progressionFeatureNames = new Set<string>();
    for (const row of raw.progression) {
      for (const special of row.special)
        if (special) progressionFeatureNames.add(normalizeFeatureName(special).toLowerCase());
    }

    for (let i = 0; i < raw.classFeatures.length; i++) {
      const cf = raw.classFeatures[i];
      const baseName = getFeatureBaseName(cf.name);
      if (
        !this.poolAptitudes.has(`__pool__${cf.name.toLowerCase()}`) &&
        !this.poolAptitudes.has(`__pool__${baseName.toLowerCase()}`)
      )
        continue;

      // This is a pool parent — check if it has inline sub-options
      const normalizedDesc = normalizeWs(cf.description);
      const parsed = readPoolSubOptions(normalizedDesc);
      if (parsed && parsed.options.length >= 2) continue; // Handled by inline parsing

      // No inline sub-options — collect orphan features that follow
      const orphans: NamedText[] = [];
      for (let j = i + 1; j < raw.classFeatures.length; j++) {
        const next = raw.classFeatures[j];
        const nextBase = getFeatureBaseName(next.name);
        const nextNorm = normalizeFeatureName(nextBase).toLowerCase();
        // Stop when we hit a feature that appears in the progression table
        if (progressionFeatureNames.has(nextNorm) || progressionFeatureNames.has(nextBase.toLowerCase())) break;
        // Skip "Weapon and Armor Proficiency" — it's not a sub-option
        if (nextBase.toLowerCase() === "weapon and armor proficiency") continue;
        orphans.push({ name: nextBase, description: normalizeWs(next.description) });
      }
      if (orphans.length >= 2) {
        this.orphanSubOptions.set(baseName.toLowerCase(), orphans);
        this.poolFeatureNames.add(cf.name.toLowerCase());
        this.poolFeatureNames.add(baseName.toLowerCase());
      }
    }
  }

  /**
   * The class's pools, from its detected aptitude picks: each feature whose description offers a choice, its aptitude
   * ("<Class> <Feature>"), and its sub-options the description lists.
   */
  private detectPools() {
    const { raw, detected } = this;
    if (!detected.aptitudePicks) return;
    const { classSlug } = this.detector;

    for (const pick of detected.aptitudePicks) {
      // Extract feature slug from target: "aptitudes.roguespecialability.allowed" → "roguespecialability"
      const slugMatch = pick.target.match(/^aptitudes\.(.+)\.allowed$/);
      if (!slugMatch) continue;
      const pickSlug = slugMatch[1].replace(new RegExp(`^${classSlug}`), "");

      // Find the matching feature occurrence
      const occ = detected.featureOccurrences.find((fo) => {
        const featureSlug = stripSeparators(fo.name);
        return featureSlug === pickSlug;
      });
      if (!occ) continue;

      // Find the raw class feature description
      const cf = this.detector.findFeature(occ.name);
      if (!cf) continue;

      const normalizedDesc = normalizeWs(cf.description);

      // Check for choice language — this is a pool feature if description mentions selection
      if (!CHOICE_PATTERN.test(normalizedDesc)) continue;

      const aptName = `${raw.name} ${occ.name}`;
      const minLevel = Math.min(...occ.levels);

      const parsed = readPoolSubOptions(normalizedDesc);
      const hasInlineSubs = parsed && parsed.options.length >= 2;

      if (hasInlineSubs) {
        for (const opt of parsed.options) {
          this.poolAptitudes.set(opt.name, {
            aptitude: aptName,
            level: minLevel,
            ...(opt.stackable ? { stackable: true } : {}),
          });
        }
      }

      // Only treat as a pool feature if it has inline sub-options;
      // orphan sub-options are detected below and will add to poolFeatureNames then
      if (hasInlineSubs) {
        this.poolFeatureNames.add(cf.name.toLowerCase());
        this.poolFeatureNames.add(occ.name.toLowerCase());
      }

      // Store aptitude info for orphan sub-option detection
      // Always set this — even without inline subs, orphan detection needs it
      // (e.g. Stonelord Stone Power has sub-options as separate classFeatures)
      this.poolAptitudes.set(`__pool__${cf.name.toLowerCase()}`, { aptitude: aptName, level: minLevel });
    }
  }

  /**
   * Detect table-based sub-options: "table: X" → "X: Y" features (e.g. "table: Loremaster Secrets" followed by
   * "Loremaster Secrets: Instant Mastery"), each table a pool's whose name its slug ends with.
   */
  private detectTableSubOptions() {
    const { raw } = this;
    for (let i = 0; i < raw.classFeatures.length; i++) {
      const cf = raw.classFeatures[i];
      if (!cf.name.startsWith("table: ")) continue;
      const tableName = cf.name.replace(/^table:\s*/, "");
      this.tableSkipNames.add(cf.name.toLowerCase()); // skip the "table: X" feature itself

      // Find matching pool parent by checking if table slug ends with pool parent slug
      let matchedParent: string | undefined;
      for (const [key] of this.poolAptitudes) {
        if (!key.startsWith("__pool__")) continue;
        const parentSlug = key.replace("__pool__", "");
        const tableSlug = stripSeparators(tableName);
        if (tableSlug.endsWith(parentSlug) || tableSlug.endsWith(parentSlug + "s")) {
          matchedParent = parentSlug;
          break;
        }
      }
      if (!matchedParent) continue;

      // Collect prefixed sub-option features
      const prefix = tableName + ": ";
      const orphans: NamedText[] = [];
      for (let j = i + 1; j < raw.classFeatures.length; j++) {
        const next = raw.classFeatures[j];
        if (!next.name.startsWith(prefix)) break;
        const subName = next.name.substring(prefix.length);
        orphans.push({ name: subName, description: normalizeWs(next.description) });
        this.tableSkipNames.add(next.name.toLowerCase());
      }

      if (orphans.length >= 2) {
        this.orphanSubOptions.set(matchedParent, orphans);
        this.poolFeatureNames.add(matchedParent);
      }
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

  /** What the class's page gives. */
  private get raw(): ClassReference["raw"] {
    return this.detector.raw;
  }

  /** The class's mapping: its pools and features, their aptitude picks, its spells and its bonus spells' ability. */
  build(): ClassReference["mapping"] {
    const { raw, detected } = this;
    this.detectPools();
    this.detectOrphanSubOptions();
    this.detectTableSubOptions();

    for (const cf of raw.classFeatures) {
      const baseName = getFeatureBaseName(cf.name);

      // Skip "Table:" entries — not class features
      if (baseName.startsWith("Table:")) continue;
      // Skip table features and their sub-options — handled via orphan sub-option detection
      if (this.tableSkipNames.has(cf.name.toLowerCase())) continue;

      // If this is a pool feature, skip it and add its sub-options instead
      if (this.poolFeatureNames.has(cf.name.toLowerCase()) || this.poolFeatureNames.has(baseName.toLowerCase())) {
        this.addPoolFeature(cf, baseName);
        continue;
      }

      // Skip orphan features — they were already added as sub-options above
      const isOrphan = [...this.orphanSubOptions.values()].some((orphans) =>
        orphans.some((o) => o.name.toLowerCase() === baseName.toLowerCase()),
      );
      if (isOrphan) continue;

      this.addFeature(cf, baseName);
    }

    this.addAptitudePickModifiers();

    const mapping: ClassReference["mapping"] = {
      classFeatureAptitude: `${raw.name} Class Feature`,
      features: this.features,
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

    const bonusSpellAbility = this.bonusSpellAbility();
    if (bonusSpellAbility) mapping.bonusSpellAbility = bonusSpellAbility;

    this.applyOverrides(mapping);
    mapping.occurrenceMap = this.occurrenceMap(mapping.features);
    return mapping;
  }
}
