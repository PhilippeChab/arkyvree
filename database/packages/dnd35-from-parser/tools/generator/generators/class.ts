import type { ClassReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/types.ts";
import { buildClassFeatSeeds, buildPoolParentNameMap, classAptitudePicks, classSpells, insertOrdinalInName, loadExistingFeats } from "@/database/packages/dnd35-from-parser/tools/buildSeeds.ts";
import { extractGrantedFeatNames, stripClassSuffix } from "@/database/packages/dnd35-from-parser/tools/shared.ts";
import {
  formatStringArray,
  listField,
  MAX_CLASS_DESC,
  quote,
  requirementImports,
  stringifyFeatModifier,
  stringifyProperty,
  stringifyRequirement,
  toConstName,
  truncateDesc,
} from "@/database/packages/dnd35-from-parser/tools/generator/codegen.ts";

// ---------------------------------------------------------------------------
// Generate FeatSeed[] TypeScript file
// ---------------------------------------------------------------------------

/** A feat as a line of a class's feats file: the class feature aptitude as `APT`. */
function stringifyFeat(feat: FeatSeed, classFeatureAptitude: string, uses: Set<string>): string {
  const parts = [
    `name: ${quote(feat.name)}`,
    `description: ${quote(feat.description)}`,
    ...feat.stackable ? ["stackable: true"] : [],
    ...feat.selectable !== undefined ? [`selectable: ${feat.selectable}`] : [],
    `aptitudes: [${feat.aptitudes.map((a) => (a === classFeatureAptitude ? "APT" : quote(a))).join(", ")}]`,
    ...feat.modifiers?.length ? [`modifiers: [${feat.modifiers.map((m) => stringifyFeatModifier(m, uses)).join(", ")}]`] : [],
    ...feat.requirements?.length ? [`requirements: [${feat.requirements.map((r) => stringifyRequirement(r, uses)).join(", ")}]`] : [],
    ...feat.properties?.length ? [`properties: [${feat.properties.map(stringifyProperty).join(", ")}]`] : [],
  ];
  return `  { ${parts.join(", ")} },`;
}

/** A class's feats file: its own feats (`buildClassFeatSeeds`). */
export function generateFeatSeeds(ref: ClassReference): string {
  const aptitude = ref.mapping.classFeatureAptitude;
  const uses = new Set<string>();
  const feats = buildClassFeatSeeds(ref).map((feat) => stringifyFeat(feat, aptitude, uses));
  return [
    `import type { FeatSeed } from "@/database/packages/dnd35/content/types.ts";`,
    ...requirementImports(uses),
    "",
    `const APT = ${quote(aptitude)};`,
    "",
    `export const ${toConstName(ref.raw.name)}_FEATS: FeatSeed[] = [`,
    ...feats,
    `];`,
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Build classFeatures array from mapping + detected
// ---------------------------------------------------------------------------

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

/** A class's features and the existing feats it grants, a feature split per level named as `perLevelPicks` splits its pick. */
function buildClassFeatures(ref: ClassReference, perLevelPicks: ReturnType<typeof classAptitudePicks>["perLevel"]): {
  classFeatures: [number, string][];
  autoFreeFeats: [number, string, string][];
} {
  const features: [number, string][] = [];
  const autoFreeFeats: [number, string, string][] = [];
  const { detected, mapping } = ref;
  const features_ = ref.mapping.features;
  const poolParentNames = buildPoolParentNameMap(features_, ref.raw.name, mapping.classFeatureAptitude);
  const existingFeats = loadExistingFeats(ref._meta.book);
  /**
   * The existing feat a feature named `name` grants: that feat (with or without the class's suffix), or one its
   * description says it gains as a bonus feat.
   */
  const existingFeatGranted = (name: string, description: string | undefined) => {
    const baseName = stripClassSuffix(name, ref.raw.name);
    if (baseName && existingFeats.has(baseName)) return baseName;
    if (existingFeats.has(name)) return name;
    return description ? extractGrantedFeatNames(description).find((n) => existingFeats.has(n)) : undefined;
  };

  // Build per-level feat name map for multi-occurrence aptitude expansions
  const perLevelFeatNames = new Map<string, Map<number, string>>();
  for (const [key, feat] of Object.entries(features_)) {
    if (!feat.modifiers) continue;
    for (const mod of feat.modifiers) {
      if (perLevelPicks.has(mod.target)) {
        const baseName = feat.seedName ?? (feat.aptitude ? `${key} (${feat.aptitude})` : key);
        const levelMap = new Map<number, string>();
        for (const exp of perLevelPicks.get(mod.target)!) {
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

    const freeFeatName = existingFeatGranted(name, feature?.description);
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
    const freeFeatName = existingFeatGranted(name, feat.description);
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

// ---------------------------------------------------------------------------
// Generate ClassSeed TypeScript file
// ---------------------------------------------------------------------------

export function generateClassSeed(ref: ClassReference): string {
  const detected = ref.detected;
  const mapping = ref.mapping;
  const raw = ref.raw;
  const overrides = ref.overrides ?? {};

  const bab = overrides.bab ?? detected.bab;
  const saves = overrides.saves ?? detected.saves;
  const classSkills = overrides.classSkills ?? raw.classSkills;
  const requirements = overrides.requirements ?? detected.requirements;

  const constName = toConstName(raw.name);
  const { aptitudePicks, remap, perLevel } = classAptitudePicks(ref);
  const { classFeatures, autoFreeFeats } = buildClassFeatures(ref, perLevel);

  // The requirement builders the class is written with, which its imports are written from
  const uses = new Set<string>();
  const lines: string[] = [];
  lines.push(`export const ${constName}: ClassSeed = {`);
  lines.push(`  name: ${quote(raw.name)},`);
  lines.push(`  description: ${quote(truncateDesc(overrides.description ?? raw.description, MAX_CLASS_DESC))},`);
  lines.push(`  hd: ${detected.hd}, levels: ${detected.levels}, skillPoints: ${detected.skillPoints},`);
  lines.push(`  bab: ${quote(bab)},`);
  lines.push(`  saves: { fortitude: ${quote(saves.fortitude)}, reflex: ${quote(saves.reflex)}, will: ${quote(saves.will)} },`);
  lines.push(`  classSkills: ${formatStringArray(classSkills, 1)},`);

  lines.push(...listField("requirements", requirements.map((req) => stringifyRequirement(req, uses, 2)), "  "));

  // Caster level advancement
  const cla = detected.casterLevelAdvancement;
  if (cla) {
    lines.push(`  casterLevelAdvancement: { type: ${quote(cla.type)}, levels: [${cla.levels.join(", ")}] },`);
  }

  // Class feature aptitude
  if (mapping.classFeatureAptitude) {
    lines.push(`  classFeatureAptitude: ${quote(mapping.classFeatureAptitude)},`);
  }

  // Class features
  if (classFeatures.length > 0) {
    lines.push(`  classFeatures: [`);
    for (const [level, name] of classFeatures) {
      lines.push(`    [${level}, ${quote(name)}],`);
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
      lines.push(`    [${level}, ${quote(feat)}, ${quote(apt)}],`);
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
    lines.push(`  bonusSpellAbility: ${quote(bonusSpellAbility)},`);
  }
  if (casterType) {
    lines.push(`  casterType: ${quote(casterType)},`);
  }

  const spells = classSpells(ref);
  if (spells) {
    lines.push(`  spells: {`);
    lines.push(`    slug: ${quote(spells.slug)},`);
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
      lines.push(`    { level: ${m.level}, target: ${quote(m.target)}, value: ${quote(m.value)}, valueType: ${quote(m.valueType)}, operator: ${quote(m.operator)} },`);
    }
    lines.push(`  ],`);
  }

  if (aptitudePicks && aptitudePicks.length > 0) {
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
        lines.push(`    { levels: [${pick.levels.join(", ")}], target: ${quote(pick.target)} },`);
      }
      lines.push(`  ],`);
    }
  }

  lines.push(`};`);

  // Flag unresolved items as TODO comments
  // Convention: if the key exists in the overrides (even empty []), it's been reviewed — no TODO
  const todos: string[] = [];
  if (!("requirements" in (overrides)) && detected.unresolvedPrereqs?.length) {
    for (const p of detected.unresolvedPrereqs) todos.push(p);
  }
  if (!("aptitudePicks" in overrides) && detected.unresolvedAptitudePicks?.length) {
    for (const a of detected.unresolvedAptitudePicks) todos.push(`Unresolved aptitude pick: "${a}"`);
  }
  if (!("modifiers" in overrides)) {
    todos.push("No modifiers defined — review if this class needs any");
  }
  if (todos.length > 0) {
    lines.push("");
    for (const todo of todos) {
      lines.push(`// TODO: ${todo}`);
    }
  }

  lines.push("");
  return [`import type { ClassSeed } from "@/database/packages/dnd35/content/types.ts";`, ...requirementImports(uses), "", ...lines].join("\n");
}

