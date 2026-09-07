import type { ClassReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";
import type { RequirementEntry } from "@/database/packages/dnd35/v1/feats/types.ts";
import { loadExistingFeats, mergeAptitudePicks, expandPerLevelAptitudePicks, buildPoolParentNameMap, buildAptitudeExpansionMaps, insertOrdinalInName } from "@/database/packages/dnd35-from-parser/tools/buildSeeds.ts";
import { autoCompanionGrantModifiers, stripSeparators, stripClassSuffix, mergedFeatures, collectImportsFromReq, extractGrantedFeatNames } from "@/database/packages/dnd35-from-parser/tools/shared.ts";
import {
  toConstName,
  escapeString,
  truncateDesc,
  MAX_CLASS_DESC,
  formatStringArray,
  stringifyRequirement,
  stringifyModifier,
} from "@/database/packages/dnd35-from-parser/tools/generator/codegen.ts";

// ---------------------------------------------------------------------------
// Generate ClassSeed TypeScript file
// ---------------------------------------------------------------------------

export function generateClassSeed(ref: ClassReference): string {
  const detected = ref.detected;
  const mapping = ref.mapping;
  const raw = ref.raw;
  const overrides = mapping.overrides ?? {};

  const bab = overrides.bab ?? detected.bab;
  const saves = overrides.saves ?? detected.saves;
  const classSkills = overrides.classSkills ?? raw.classSkills;
  const requirements = overrides.requirements ?? detected.requirements;

  const constName = toConstName(raw.name);
  const { classFeatures, autoFreeFeats } = buildClassFeatures(ref);

  // Determine which imports are needed
  const imports = collectRequirementImports(requirements);

  const lines: string[] = [];

  lines.push(`import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";`);
  if (imports.size > 0) {
    const importList = Array.from(imports).sort().join(", ");
    lines.push(`import { ${importList} } from "@/database/packages/dnd35/v1/feats/types.ts";`);
  }
  lines.push("");
  lines.push(`export const ${constName}: ClassSeed = {`);
  lines.push(`  name: "${escapeString(raw.name)}",`);
  lines.push(`  description: "${escapeString(truncateDesc(overrides.description ?? raw.description, MAX_CLASS_DESC))}",`);
  lines.push(`  hd: ${detected.hd}, levels: ${detected.levels}, skillPoints: ${detected.skillPoints},`);
  lines.push(`  bab: "${bab}",`);
  lines.push(`  saves: { fortitude: "${saves.fortitude}", reflex: "${saves.reflex}", will: "${saves.will}" },`);
  lines.push(`  classSkills: ${formatStringArray(classSkills, 1)},`);

  // Requirements
  if (requirements.length > 0) {
    lines.push(`  requirements: [`);
    for (const req of requirements) {
      lines.push(`    ${stringifyRequirement(req, 2)},`);
    }
    lines.push(`  ],`);
  }

  // Caster level advancement
  const cla = detected.casterLevelAdvancement;
  if (cla) {
    lines.push(`  casterLevelAdvancement: { type: "${cla.type}", levels: [${cla.levels.join(", ")}] },`);
  }

  // Class feature aptitude
  if (mapping.classFeatureAptitude) {
    lines.push(`  classFeatureAptitude: "${escapeString(mapping.classFeatureAptitude)}",`);
  }

  // Class features
  if (classFeatures.length > 0) {
    lines.push(`  classFeatures: [`);
    for (const [level, name] of classFeatures) {
      lines.push(`    [${level}, "${escapeString(name)}"],`);
    }
    lines.push(`  ],`);
  }

  // Optional fields from mapping
  if (overrides.proficiencies && overrides.proficiencies.length > 0) {
    lines.push(`  proficiencies: ${formatStringArray(overrides.proficiencies, 1)},`);
  }

  const allFreeFeats = [...(overrides.freeFeats ?? []), ...autoFreeFeats];
  if (allFreeFeats.length > 0) {
    lines.push(`  freeFeats: [`);
    for (const [level, feat, apt] of allFreeFeats) {
      lines.push(`    [${level}, "${escapeString(feat)}", "${escapeString(apt)}"],`);
    }
    lines.push(`  ],`);
  }

  const bonusSpellAbility = overrides.bonusSpellAbility ?? mapping.bonusSpellAbility;
  const casterType = overrides.casterType ?? detected.casterType;

  if (bonusSpellAbility && !casterType) {
    throw new Error(`${raw.name}: has bonusSpellAbility ("${bonusSpellAbility}") but no casterType`);
  }
  if (casterType && !bonusSpellAbility) {
    throw new Error(`${raw.name}: has casterType ("${casterType}") but no bonusSpellAbility`);
  }

  if (bonusSpellAbility) {
    lines.push(`  bonusSpellAbility: "${escapeString(bonusSpellAbility)}",`);
  }
  if (casterType) {
    lines.push(`  casterType: "${casterType}",`);
  }

  const spells = overrides.spells
    ? mapping.spells ? { ...mapping.spells, ...overrides.spells } : undefined
    : mapping.spells;
  if (spells) {
    lines.push(`  spells: {`);
    lines.push(`    slug: "${escapeString(spells.slug)}",`);
    lines.push(`    perDay: [`);
    for (const row of spells.perDay) {
      lines.push(`      [${row.join(", ")}],`);
    }
    lines.push(`    ],`);
    if (spells.known) {
      lines.push(`    known: [`);
      for (const row of spells.known) {
        lines.push(`      [${row.join(", ")}],`);
      }
      lines.push(`    ],`);
    }
    if (spells.knowAll && !spells.known) lines.push(`    knowAll: true,`);
    if (spells.noCantrips) lines.push(`    noCantrips: true,`);
    lines.push(`  },`);
  }

  if (overrides.modifiers && overrides.modifiers.length > 0) {
    lines.push(`  modifiers: [`);
    for (const m of overrides.modifiers) {
      lines.push(`    { level: ${m.level}, target: "${escapeString(m.target)}", value: "${escapeString(m.value)}", valueType: "${escapeString(m.valueType)}", operator: "${escapeString(m.operator)}" },`);
    }
    lines.push(`  ],`);
  }

  const mergedPicks = mergeAptitudePicks(detected.aptitudePicks, overrides.aptitudePicks);
  const aptitudePicks = expandPerLevelAptitudePicks(mergedPicks, overrides.bonusFeatLists ?? detected.bonusFeatLists, raw.name);
  if (aptitudePicks && aptitudePicks.length > 0) {
    const { remap, perLevel } = buildAptitudeExpansionMaps(mergedPicks, aptitudePicks);

    // Strip picks already handled by feat modifiers on class features
    const mf = mergedFeatures(ref);
    const featModTargets = new Set<string>();
    for (const feat of Object.values(mf)) {
      if (feat.modifiers) {
        for (const m of feat.modifiers) {
          if (m.operator === "add" && m.target.startsWith("aptitudes.") && m.target.endsWith(".allowed")) {
            const remapped = remap.get(m.target);
            if (remapped) {
              featModTargets.add(remapped);
            } else {
              const expansions = perLevel.get(m.target);
              if (expansions) {
                for (const exp of expansions) featModTargets.add(exp.newTarget);
              } else {
                featModTargets.add(m.target);
              }
            }
          }
        }
      }
    }
    const filtered = aptitudePicks.filter((p) => !featModTargets.has(p.target));
    if (filtered.length > 0) {
      lines.push(`  aptitudePicks: [`);
      for (const pick of filtered) {
        lines.push(`    { levels: [${pick.levels.join(", ")}], target: "${escapeString(pick.target)}" },`);
      }
      lines.push(`  ],`);
    }
  }

  lines.push(`};`);

  // Flag unresolved items as TODO comments
  // Convention: if the key exists in mapping (even empty []), it's been reviewed — no TODO
  const todos: string[] = [];
  if (!("requirements" in (overrides)) && detected.unresolvedPrereqs?.length) {
    for (const p of detected.unresolvedPrereqs) todos.push(p);
  }
  if (!("aptitudePicks" in mapping) && !("aptitudePicks" in overrides) && detected.unresolvedAptitudePicks?.length) {
    for (const a of detected.unresolvedAptitudePicks) todos.push(`Unresolved aptitude pick: "${a}"`);
  }
  if (!("modifiers" in mapping)) {
    todos.push("No modifiers defined — review if this class needs any");
  }
  if (todos.length > 0) {
    lines.push("");
    for (const todo of todos) {
      lines.push(`// TODO: ${todo}`);
    }
  }

  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Generate FeatSeed[] TypeScript file
// ---------------------------------------------------------------------------

export function generateFeatSeeds(ref: ClassReference): string {
  const mapping = ref.mapping;
  const features = mergedFeatures(ref);
  const constName = `${toConstName(ref.raw.name)}_FEATS`;
  const aptConst = "APT";
  const existingFeats = loadExistingFeats(ref._meta.book);

  const lines: string[] = [];
  const overrides = mapping.overrides ?? {};
  const classSlug = stripSeparators(ref.raw.name);

  // Build map from aptitude slug → minimum pick level
  const aptitudeMinLevel = new Map<string, number>();
  const mergedPicks = mergeAptitudePicks(ref.detected.aptitudePicks, overrides.aptitudePicks);
  const aptitudePicks = expandPerLevelAptitudePicks(mergedPicks, overrides.bonusFeatLists ?? ref.detected.bonusFeatLists, ref.raw.name);
  if (aptitudePicks) {
    for (const pick of aptitudePicks) {
      const slugMatch = pick.target.match(/^aptitudes\.(.+)\.allowed$/);
      if (slugMatch) {
        aptitudeMinLevel.set(slugMatch[1], Math.min(...pick.levels));
      }
    }
  }

  // Build expansion maps for aptitude target remapping
  const { remap: aptitudeTargetRemap, perLevel: perLevelExpansion } = buildAptitudeExpansionMaps(mergedPicks, aptitudePicks);

  // Determine imports
  const needsModifierImports = Object.values(features).some((f) => f.modifiers && f.modifiers.length > 0);
  const modImports = new Set<string>();
  if (needsModifierImports) {
    for (const f of Object.values(features)) {
      if (f.modifiers) {
        for (const m of f.modifiers) {
          if (m.requirements) {
            for (const r of m.requirements) {
              collectImportsFromReq(r, modImports);
            }
          }
        }
      }
    }
  }
  lines.push(`import type { FeatSeed } from "@/database/packages/dnd35/v1/feats/types.ts";`);
  const allImports = new Set([...modImports]);
  const IMPORT_PLACEHOLDER = `__SEED_UTILS_IMPORT__`;
  lines.push(IMPORT_PLACEHOLDER);
  lines.push("");
  lines.push(`const ${aptConst} = "${escapeString(mapping.classFeatureAptitude)}";`);
  lines.push("");
  lines.push(`export const ${constName}: FeatSeed[] = [`);

  const lockedFeByKey = new Map<string, string>();
  for (const lf of ref.detected.lockedFavoredEnemies ?? []) {
    const occName = lf.featureName;
    const mappingKey = mapping.occurrenceMap?.[occName];
    if (mappingKey) lockedFeByKey.set(mappingKey.toLowerCase(), lf.creatureType);
    lockedFeByKey.set(occName.toLowerCase(), lf.creatureType);
  }

  const featureEntries = Object.entries(features).filter(([key, f]) => {
    if (f.skip) return false;
    // Skip feats that duplicate existing feats (handled as freeFeats).
    // Locked-favored-enemy feats are emitted in-place — they grant the
    // underlying base-ruleset variant via a `feats.<slug>.possessed`
    // modifier rather than being rerouted to it.
    if (lockedFeByKey.has(key.toLowerCase())) return true;
    const baseName = stripClassSuffix(f.seedName ?? (f.aptitude ? `${key} (${f.aptitude})` : key), ref.raw.name);
    if (baseName && existingFeats.has(baseName)) return false;
    return true;
  });
  for (let i = 0; i < featureEntries.length; i++) {
    const [key, feat] = featureEntries[i];

    // Check if this feat has modifiers targeting a per-level expanded aptitude (multi-occurrence)
    const perLevelMod = feat.modifiers?.find((m) => perLevelExpansion.has(m.target));
    if (perLevelMod) {
      const expansions = perLevelExpansion.get(perLevelMod.target)!;
      const baseName = feat.seedName ?? (feat.aptitude ? `${key} (${feat.aptitude})` : key);
      for (const exp of expansions) {
        const name = insertOrdinalInName(baseName, exp.ordinal);
        const minLevel = Math.min(...exp.levels);
        const parts: string[] = [];
        parts.push(`name: "${escapeString(name)}"`);
        parts.push(`description: "${escapeString(truncateDesc(feat.description ?? ""))}"`);
        parts.push(`selectable: false`);
        parts.push(`aptitudes: [${feat.aptitude ? `"${escapeString(feat.aptitude)}"` : aptConst}]`);
        if (feat.modifiers && feat.modifiers.length > 0) {
          const remapped = feat.modifiers.map((m) => {
            if (m.target === perLevelMod.target) return { ...m, target: exp.newTarget };
            return m;
          });
          const modStrs = remapped.map((m) => stringifyModifier(m));
          parts.push(`modifiers: [${modStrs.join(", ")}]`);
        }
        if (minLevel > 1) {
          allImports.add("gte");
          parts.push(`requirements: [gte("classes.${classSlug}.level", ${minLevel})]`);
        }
        lines.push(`  { ${parts.join(", ")} },`);
      }
      continue;
    }

    const parts: string[] = [];
    const featName = feat.seedName ?? (feat.aptitude ? `${key} (${feat.aptitude})` : key);
    const lockedFeType = lockedFeByKey.get(key.toLowerCase());
    parts.push(`name: "${escapeString(featName)}"`);
    parts.push(`description: "${escapeString(truncateDesc(feat.description ?? ""))}"`);
    if (feat.stackable || lockedFeType) parts.push(`stackable: true`);
    const isAutoGranted = feat.level != null && !feat.aptitude;
    if (feat.selectable) parts.push(`selectable: true`);
    else if (feat.selectable === false || isAutoGranted || lockedFeType) parts.push(`selectable: false`);
    if (feat.aptitude) {
      parts.push(`aptitudes: ["${escapeString(feat.aptitude)}"]`);
    } else {
      parts.push(`aptitudes: [${aptConst}]`);
    }

    const baseModifiers = feat.modifiers ?? [];
    const autoModifiers = autoCompanionGrantModifiers(featName, feat.description ?? "");
    const lockedFeModifiers = lockedFeType
      ? [{
          target: `feats.${stripSeparators(`Favored Enemy: ${lockedFeType}`)}.possessed`,
          operator: "set",
          value: "true",
          valueType: "boolean",
        }]
      : [];
    if (baseModifiers.length > 0 || autoModifiers.length > 0 || lockedFeModifiers.length > 0) {
      const remapped = baseModifiers.map((m) => {
        const newTarget = aptitudeTargetRemap.get(m.target);
        return newTarget ? { ...m, target: newTarget } : m;
      });
      const modStrs = [...remapped, ...autoModifiers, ...lockedFeModifiers].map((m) => stringifyModifier(m));
      parts.push(`modifiers: [${modStrs.join(", ")}]`);
    }

    if (feat.aptitude && feat.aptitude !== mapping.classFeatureAptitude) {
      const aptSlug = stripSeparators(feat.aptitude);
      const minLevel = aptitudeMinLevel.get(aptSlug);
      if (minLevel != null && minLevel > 1) {
        allImports.add("gte");
        parts.push(`requirements: [gte("classes.${classSlug}.level", ${minLevel})]`);
      }
    }

    const featFamily = lockedFeType
      ? "Favored Enemy"
      : detectClassFeatFamily(feat.seedName ?? (feat.aptitude ? `${key} (${feat.aptitude})` : key));
    if (featFamily) {
      parts.push(`properties: [{ type: "FEAT_FAMILY", value: "${escapeString(featFamily)}" }]`);
    }

    const line = `  { ${parts.join(", ")} },`;

    lines.push(line);
  }

  // Append advancement feat for qualifying spellcasting classes
  const detected = ref.detected;
  const casterType = overrides.casterType ?? detected.casterType;
  if (detected.hasOwnSpells && casterType && !detected.casterLevelAdvancement) {
    allImports.add("gte");
    const aptConst = casterType === "Divine" ? `"Bonus Divine Caster Level"` : `"Bonus Arcane Caster Level"`;
    const parts: string[] = [];
    parts.push(`name: "Advance ${escapeString(ref.raw.name)} Spellcasting"`);
    parts.push(`description: "Your effective ${classSlug} caster level increases by 1, granting additional spell slots and spells per day as if you had gained a level in ${classSlug}."`);
    parts.push(`stackable: true`);
    parts.push(`aptitudes: [${aptConst}, "Bonus Caster Level"]`);
    parts.push(`modifiers: [{ target: "classes.${classSlug}.bonuscasterlevel", operator: "add", value: "1", valueType: "number" }]`);
    parts.push(`requirements: [gte("classes.${classSlug}.level", 1)]`);
    lines.push(`  { ${parts.join(", ")} },`);
  }

  lines.push(`];`);
  lines.push("");

  // Replace import placeholder now that we know all needed imports
  const idx = lines.indexOf(IMPORT_PLACEHOLDER);
  if (idx !== -1) {
    if (allImports.size > 0) {
      lines[idx] = `import { ${Array.from(allImports).sort().join(", ")} } from "@/database/packages/dnd35/seed-utils.ts";`;
    } else {
      lines.splice(idx, 1);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Build classFeatures array from mapping + detected
// ---------------------------------------------------------------------------

function buildClassFeatures(ref: ClassReference): {
  classFeatures: [number, string][];
  autoFreeFeats: [number, string, string][];
} {
  const features: [number, string][] = [];
  const autoFreeFeats: [number, string, string][] = [];
  const { detected, mapping } = ref;
  const overrides = mapping.overrides ?? {};
  const features_ = mergedFeatures(ref);
  const poolParentNames = buildPoolParentNameMap(features_, ref.raw.name, mapping.classFeatureAptitude);
  const existingFeats = loadExistingFeats(ref._meta.book);

  // Build per-level feat name map for multi-occurrence aptitude expansions
  const preMergedForNames = mergeAptitudePicks(detected.aptitudePicks, overrides.aptitudePicks);
  const expandedForNames = expandPerLevelAptitudePicks(preMergedForNames, overrides.bonusFeatLists ?? detected.bonusFeatLists, ref.raw.name);
  const { perLevel: perLevelForNames } = buildAptitudeExpansionMaps(preMergedForNames, expandedForNames);
  const perLevelFeatNames = new Map<string, Map<number, string>>();
  for (const [key, feat] of Object.entries(features_)) {
    if (!feat.modifiers) continue;
    for (const mod of feat.modifiers) {
      if (perLevelForNames.has(mod.target)) {
        const baseName = feat.seedName ?? (feat.aptitude ? `${key} (${feat.aptitude})` : key);
        const levelMap = new Map<number, string>();
        for (const exp of perLevelForNames.get(mod.target)!) {
          const perLevelName = insertOrdinalInName(baseName, exp.ordinal);
          for (const level of exp.levels) levelMap.set(level, perLevelName);
        }
        perLevelFeatNames.set(key.toLowerCase(), levelMap);
      }
    }
  }

  for (const occ of detected.featureOccurrences) {
    const mappingKey = mapping.occurrenceMap?.[occ.name];
    const feature = mappingKey ? features_[mappingKey] : undefined;
    if (feature?.skip) continue;

    const mappedName = feature?.seedName ?? findMappedName(occ.name, features_);
    const name = mappedName ?? (poolParentNames.get(occ.name.toLowerCase()) ?? occ.name);

    // Check if this is an existing feat (with or without class suffix)
    const baseName = stripClassSuffix(name, ref.raw.name);
    let freeFeatName = baseName && existingFeats.has(baseName) ? baseName
      : existingFeats.has(name) ? name
      : undefined;
    // Fallback: parse description for "gains X as a bonus feat" patterns
    if (!freeFeatName && feature?.description) {
      const granted = extractGrantedFeatNames(feature.description);
      freeFeatName = granted.find((n) => existingFeats.has(n));
    }
    if (freeFeatName && mapping.classFeatureAptitude) {
      for (const level of occ.levels) autoFreeFeats.push([level, freeFeatName, mapping.classFeatureAptitude]);
    } else {
      // Check for per-level split names
      const resolvedKey = mappingKey?.toLowerCase() ?? occ.name.toLowerCase();
      const levelMap = perLevelFeatNames.get(resolvedKey);
      for (const level of occ.levels) {
        features.push([level, levelMap?.get(level) ?? name]);
      }
    }
  }

  // Add mapping features that have a level but no matching occurrence
  // (e.g. "Weapon and Armor Proficiency" — not in progression table, only in class features text)
  const coveredKeys = new Set<string>();
  for (const occ of detected.featureOccurrences) {
    const key = mapping.occurrenceMap?.[occ.name] ?? occ.name;
    coveredKeys.add(key.toLowerCase());
  }
  for (const [key, feat] of Object.entries(features_)) {
    if (feat.skip || feat.level == null || coveredKeys.has(key.toLowerCase())) continue;
    if (feat.aptitude && feat.aptitude !== mapping.classFeatureAptitude) continue;
    const name = feat.seedName ?? key;
    const baseName = stripClassSuffix(name, ref.raw.name);
    let freeFeatName = baseName && existingFeats.has(baseName) ? baseName
      : existingFeats.has(name) ? name
      : undefined;
    if (!freeFeatName && feat.description) {
      const granted = extractGrantedFeatNames(feat.description);
      freeFeatName = granted.find((n) => existingFeats.has(n));
    }
    if (freeFeatName && mapping.classFeatureAptitude) {
      autoFreeFeats.push([feat.level, freeFeatName, mapping.classFeatureAptitude]);
    } else {
      features.push([feat.level, name]);
    }
  }

  features.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
  autoFreeFeats.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
  return { classFeatures: features, autoFreeFeats };
}

function findMappedName(
  rawName: string,
  features: ClassReference["mapping"]["features"],
): string | undefined {
  if (!features) return undefined;
  // Exact match
  if (features[rawName]) return features[rawName].seedName;

  // Case-insensitive match
  const lower = rawName.toLowerCase();
  for (const [key, val] of Object.entries(features)) {
    if (key.toLowerCase() === lower) return val.seedName;
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// FEAT_FAMILY detection for class features
// ---------------------------------------------------------------------------

const CLASS_FEAT_FAMILIES: { pattern: RegExp; family: string }[] = [
  { pattern: /^(?:Turn or Rebuke Undead|Turn Undead|Rebuke Undead)\b/i, family: "Turn or Rebuke Undead" },
  { pattern: /^Wild Shape\b/i, family: "Wild Shape" },
];

function detectClassFeatFamily(name: string): string | undefined {
  for (const { pattern, family } of CLASS_FEAT_FAMILIES) {
    if (pattern.test(name)) return family;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Import collection
// ---------------------------------------------------------------------------

function collectRequirementImports(reqs: RequirementEntry[]): Set<string> {
  const imports = new Set<string>();
  for (const req of reqs) {
    collectImportsFromReq(req, imports);
  }
  return imports;
}
