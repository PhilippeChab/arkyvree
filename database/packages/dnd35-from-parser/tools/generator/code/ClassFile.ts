import { CodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/CodeFile.ts";
import { resolveFamilyChecks } from "@/database/packages/dnd35-from-parser/tools/generator/code/featFiles.ts";
import {
  formatStringArray,
  listField,
  quote,
  toConstName,
} from "@/database/packages/dnd35-from-parser/tools/generator/code/literals.ts";
import TemplateFamilies from "@/database/packages/dnd35-from-parser/tools/generator/code/TemplateFamilies.ts";
import { getClassAptitudePicks } from "@/database/packages/dnd35-from-parser/tools/seeds/classes/aptitudePicks.ts";
import {
  buildPoolParentNameMap,
  findExistingFeatGranted,
  insertOrdinalInName,
} from "@/database/packages/dnd35-from-parser/tools/seeds/classes/features.ts";
import { buildClassModifiers } from "@/database/packages/dnd35-from-parser/tools/seeds/classes/modifiers.ts";
import { getClassSpells } from "@/database/packages/dnd35-from-parser/tools/seeds/classes/spellSlots.ts";
import { normalizeDescription } from "@/database/packages/dnd35-from-parser/tools/text/scrapedText.ts";
import type { ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import type { RequirementEntry } from "@/database/packages/dnd35/content/customization/types.ts";
import { stripSeparators } from "@/shared/text.ts";

/** A class's features and the existing feats it grants, a feature split per level named as `perLevelPicks` splits its pick. */
function buildClassFeatures(
  ref: ClassReference,
  perLevelPicks: ReturnType<typeof getClassAptitudePicks>["perLevel"],
): {
  classFeatures: [number, string][];
  autoFreeFeats: [number, string, string][];
} {
  const features: [number, string][] = [];
  const autoFreeFeats: [number, string, string][] = [];
  const { detected, mapping } = ref;
  const features_ = ref.mapping.features;
  const poolParentNames = buildPoolParentNameMap(features_, ref.raw.name, mapping.classFeatureAptitude);

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
    const name = mappedName ?? poolParentNames.get(occ.name.toLowerCase()) ?? occ.name;

    const freeFeatName = findExistingFeatGranted(ref, name, feature?.description);
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
    const freeFeatName = findExistingFeatGranted(ref, name, feat.description);
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

function findMappedName(rawName: string, features: ClassReference["mapping"]["features"]): string | undefined {
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

/**
 * A class reference's ClassSeed file (classes/<slug>.ts), written field by field: what its reference gives each, and
 * the requirement builders its checks are written with, which its imports are written from.
 */
export class ClassFile extends CodeFile {
  constructor(private readonly ref: ClassReference) {
    super();
  }

  /**
   * What's left to review in the class, which opens its file: what the generator couldn't resolve, unless the overrides
   * name the key (even empty: reviewed).
   */
  private reviewNotes(): string[] {
    const { detected } = this.ref;
    const overrides = this.ref.overrides ?? {};
    const todos: string[] = [];
    if (!("requirements" in overrides) && detected.unresolvedPrereqs?.length) {
      for (const p of detected.unresolvedPrereqs) todos.push(p);
    }
    if (!("aptitudePicks" in overrides) && detected.unresolvedAptitudePicks?.length) {
      for (const a of detected.unresolvedAptitudePicks) todos.push(`Unresolved aptitude pick: "${a}"`);
    }
    if (!("modifiers" in overrides) && !("columns" in overrides)) {
      todos.push("No modifiers defined — review if this class needs any");
    }
    return todos.length > 0 ? ["/**", " * To review:", ...todos.map((todo) => ` * - ${todo}`), " */", ""] : [];
  }

  /** The class's aptitude picks, but those its features' modifiers already give (`remap`ped or split `perLevel`). */
  private writeAptitudePicks({ aptitudePicks, remap, perLevel }: ReturnType<typeof getClassAptitudePicks>) {
    if (!aptitudePicks || aptitudePicks.length === 0) return;
    // Strip picks already handled by feat modifiers on class features
    const mf = this.ref.mapping.features;
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
      this.lines.push(`  aptitudePicks: [`);
      for (const pick of filtered) {
        this.lines.push(`    { levels: [${pick.levels.join(", ")}], target: ${quote(pick.target)} },`);
      }
      this.lines.push(`  ],`);
    }
  }

  /** The class's spellcasting: its bonus spells' ability and its caster type, which one without the other refuses. */
  private writeCasting() {
    const { detected, mapping, raw } = this.ref;
    const overrides = this.ref.overrides ?? {};
    const bonusSpellAbility = overrides.bonusSpellAbility ?? mapping.bonusSpellAbility;
    const casterType = overrides.casterType ?? detected.casterType;

    if (bonusSpellAbility && !casterType) {
      throw new Error(`${raw.name}: has bonusSpellAbility ("${bonusSpellAbility}") but no casterType`);
    }
    if (casterType && !bonusSpellAbility) {
      throw new Error(`${raw.name}: has casterType ("${casterType}") but no bonusSpellAbility`);
    }

    if (bonusSpellAbility) {
      this.lines.push(`  bonusSpellAbility: ${quote(bonusSpellAbility)},`);
    }
    if (casterType) {
      this.lines.push(`  casterType: ${quote(casterType)},`);
    }
  }

  /** The class's features by level, its proficiencies, and the feats it gives (its overrides' and those detected). */
  private writeFeatures({ classFeatures, autoFreeFeats }: ReturnType<typeof buildClassFeatures>) {
    const overrides = this.ref.overrides ?? {};
    // Class features
    if (classFeatures.length > 0) {
      this.lines.push(`  classFeatures: [`);
      for (const [level, name] of classFeatures) {
        this.lines.push(`    [${level}, ${quote(name)}],`);
      }
      this.lines.push(`  ],`);
    }

    // Optional fields from mapping
    if (overrides.proficiencies && overrides.proficiencies.length > 0) {
      this.lines.push(`  proficiencies: ${formatStringArray(overrides.proficiencies, 1)},`);
    }

    const allFreeFeats = [...(overrides.freeFeats ?? []), ...autoFreeFeats];
    if (allFreeFeats.length > 0) {
      this.lines.push(`  freeFeats: [`);
      for (const [level, feat, apt] of allFreeFeats) {
        this.lines.push(`    [${level}, ${quote(feat)}, ${quote(apt)}],`);
      }
      this.lines.push(`  ],`);
    }
  }

  /** The class's modifiers, each at its level, with the requirements that gate it. */
  private writeModifiers() {
    const modifiers = buildClassModifiers(this.ref);
    if (modifiers.length === 0) return;
    this.lines.push(`  modifiers: [`);
    for (const m of modifiers) {
      const requirements = (m.requirements ?? []).map((r) => this.requirement(r, 3));
      const gate = requirements.length > 0 ? `, requirements: [${requirements.join(", ")}]` : "";
      this.lines.push(
        `    { level: ${m.level}, target: ${quote(m.target)}, value: ${quote(m.value)}, valueType: ${quote(m.valueType)}, operator: ${quote(m.operator)}${gate} },`,
      );
    }
    this.lines.push(`  ],`);
  }

  /** The class's spells: its slots per day and spells known by level, and the lists it casts from. */
  private writeSpells() {
    const spells = getClassSpells(this.ref);
    if (!spells) return;
    this.lines.push(`  spells: {`);
    this.lines.push(`    slug: ${quote(spells.slug)},`);
    this.lines.push(`    perDay: [`);
    for (const row of spells.perDay) {
      this.lines.push(`      [${row.join(", ")}],`);
    }
    this.lines.push(`    ],`);
    if (spells.known) {
      this.lines.push(`    known: [`);
      for (const row of spells.known) {
        this.lines.push(`      [${row.join(", ")}],`);
      }
      this.lines.push(`    ],`);
    }
    if (spells.knowAll && !spells.known) this.lines.push(`    knowAll: true,`);
    if (spells.noCantrips) this.lines.push(`    noCantrips: true,`);
    if (spells.lists) {
      this.lines.push(`    lists: [`);
      for (const list of spells.lists) {
        const requirements = list.requirements.map((r) => this.requirement(r, 3));
        this.lines.push(
          `      { slug: ${quote(stripSeparators(list.name))}, requirements: [${requirements.join(", ")}] },`,
        );
      }
      this.lines.push(`    ],`);
    }
    this.lines.push(`  },`);
  }

  /** The class's opening fields: its name and description, hit die, levels, skills, BAB, saves and requirements. */
  private writeSummary(requirements: RequirementEntry[]) {
    const { detected, raw } = this.ref;
    const overrides = this.ref.overrides ?? {};
    const bab = overrides.bab ?? detected.bab;
    const saves = overrides.saves ?? detected.saves;
    const classSkills = overrides.classSkills ?? raw.classSkills;
    this.lines.push(`export const ${toConstName(raw.name)}: ClassSeed = {`);
    this.lines.push(`  name: ${quote(raw.name)},`);
    this.lines.push(`  description: ${quote(normalizeDescription(overrides.description ?? raw.description))},`);
    this.lines.push(`  hd: ${detected.hd}, levels: ${detected.levels}, skillPoints: ${detected.skillPoints},`);
    this.lines.push(`  bab: ${quote(bab)},`);
    this.lines.push(
      `  saves: { fortitude: ${quote(saves.fortitude)}, reflex: ${quote(saves.reflex)}, will: ${quote(saves.will)} },`,
    );
    this.lines.push(`  classSkills: ${formatStringArray(classSkills, 1)},`);
    this.lines.push(
      ...listField(
        "requirements",
        requirements.map((req) => this.requirement(req, 2)),
        "  ",
      ),
    );
  }

  /** The class's file: its fields, then what's left to review opening it, and the imports of what its checks use. */
  classCode(): string {
    const { detected, mapping } = this.ref;
    const requirements = resolveFamilyChecks(
      this.ref.overrides?.requirements ?? detected.requirements,
      TemplateFamilies.requirable(this.ref._meta.book),
    );
    const picks = getClassAptitudePicks(this.ref);
    const features = buildClassFeatures(this.ref, picks.perLevel);

    this.writeSummary(requirements);
    // Caster level advancement
    const cla = detected.casterLevelAdvancement;
    if (cla) {
      this.lines.push(`  casterLevelAdvancement: { type: ${quote(cla.type)}, levels: [${cla.levels.join(", ")}] },`);
    }
    // Class feature aptitude
    if (mapping.classFeatureAptitude) {
      this.lines.push(`  classFeatureAptitude: ${quote(mapping.classFeatureAptitude)},`);
    }
    this.writeFeatures(features);
    this.writeCasting();
    this.writeSpells();
    this.writeModifiers();
    this.writeAptitudePicks(picks);
    this.lines.push(`};`);
    this.lines.push("");
    return this.code([
      ...this.reviewNotes(),
      `import type { ClassSeed } from "@/database/packages/dnd35/content/classes/types.ts";`,
    ]);
  }
}
