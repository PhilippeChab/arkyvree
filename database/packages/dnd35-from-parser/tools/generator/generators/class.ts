import type { ClassReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";
import type { FeatSeed, RequirementEntry } from "@/database/packages/dnd35/content/types.ts";
import { buildAptitudeExpansionMaps, buildClassFeatSeeds, buildPoolParentNameMap, classSpells, expandPerLevelAptitudePicks, insertOrdinalInName, loadExistingFeats, mergeAptitudePicks } from "@/database/packages/dnd35-from-parser/tools/buildSeeds.ts";
import { stripClassSuffix, extractGrantedFeatNames } from "@/database/packages/dnd35-from-parser/tools/shared.ts";
import {
  toConstName,
  escapeString,
  truncateDesc,
  MAX_CLASS_DESC,
  formatStringArray,
  collectImportsFromReq,
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

  lines.push(`import type { ClassSeed } from "@/database/packages/dnd35/content/types.ts";`);
  if (imports.size > 0) {
    const importList = Array.from(imports).sort().join(", ");
    lines.push(`import { ${importList} } from "@/database/packages/dnd35/content/requirements.ts";`);
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

  const spells = classSpells(ref);
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
    const mf = ref.mapping.features;
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

/** A feat as a line of a class's feats file: the class feature aptitude as `APT`. */
function stringifyFeat(feat: FeatSeed, classFeatureAptitude: string): string {
  const parts = [
    `name: "${escapeString(feat.name)}"`,
    `description: "${escapeString(feat.description)}"`,
    ...feat.stackable ? ["stackable: true"] : [],
    ...feat.selectable !== undefined ? [`selectable: ${feat.selectable}`] : [],
    `aptitudes: [${feat.aptitudes.map((a) => (a === classFeatureAptitude ? "APT" : `"${escapeString(a)}"`)).join(", ")}]`,
    ...feat.modifiers?.length ? [`modifiers: [${feat.modifiers.map((m) => stringifyModifier(m)).join(", ")}]`] : [],
    ...feat.requirements?.length ? [`requirements: [${feat.requirements.map((r) => stringifyRequirement(r)).join(", ")}]`] : [],
    ...feat.properties?.length ? [`properties: [${feat.properties.map((p) => `{ type: "${p.type}", value: "${escapeString(p.value)}" }`).join(", ")}]`] : [],
  ];
  return `  { ${parts.join(", ")} },`;
}

/** A class's feats file: its own feats (`buildClassFeatSeeds`). */
export function generateFeatSeeds(ref: ClassReference): string {
  const feats = buildClassFeatSeeds(ref);
  const aptitude = ref.mapping.classFeatureAptitude;
  const imports = new Set<string>();
  for (const feat of feats) {
    for (const requirement of feat.requirements ?? []) collectImportsFromReq(requirement, imports);
    for (const modifier of feat.modifiers ?? []) for (const requirement of modifier.requirements ?? []) collectImportsFromReq(requirement, imports);
  }
  return [
    `import type { FeatSeed } from "@/database/packages/dnd35/content/types.ts";`,
    ...imports.size > 0 ? [`import { ${[...imports].sort().join(", ")} } from "@/database/packages/dnd35/content/requirements.ts";`] : [],
    "",
    `const APT = "${escapeString(aptitude)}";`,
    "",
    `export const ${toConstName(ref.raw.name)}_FEATS: FeatSeed[] = [`,
    ...feats.map((feat) => stringifyFeat(feat, aptitude)),
    `];`,
    "",
  ].join("\n");
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
  const features_ = ref.mapping.features;
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
// Import collection
// ---------------------------------------------------------------------------

function collectRequirementImports(reqs: RequirementEntry[]): Set<string> {
  const imports = new Set<string>();
  for (const req of reqs) {
    collectImportsFromReq(req, imports);
  }
  return imports;
}
