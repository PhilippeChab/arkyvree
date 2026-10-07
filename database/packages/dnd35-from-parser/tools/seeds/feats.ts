/** What a feat reference makes: its feats by feat type and its template families, and a feat's checks of a family. */

import { readCompanionGrantModifiers } from "@/database/packages/dnd35-from-parser/tools/detect/readers/modifiers/grants.ts";
import { normalizeName } from "@/database/packages/dnd35-from-parser/tools/text/names.ts";
import { normalizeDescription } from "@/database/packages/dnd35-from-parser/tools/text/scrapedText.ts";
import type { FeatReference } from "@/database/packages/dnd35-from-parser/tools/types/feats.ts";
import type { ModifierSeed, RequirementEntry } from "@/database/packages/dnd35/content/customization/types.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";
import { stripSeparators } from "@/shared/text.ts";

type FeatEntry = {
  detected: FeatReference["detected"][string];
  entry: FeatReference["raw"][number];
  mapped: FeatReference["mapping"][string];
};

/** A template feat's family, which the generated code makes a feat of per item (weapon, skill, school…). */
export type TemplateFamily = {
  aptitudes: string[];
  description: string;
  familyName: string;
  featNameMap: Record<string, string>;
  modifiers: ModifierSeed[];
  /** The content's list its feats are made over, as the generated code names it (`ALL_WEAPONS`, `SKILL_NAMES`…). */
  options: string;
  /** Its feats require proficiency with their weapon (`proficiencyRequirements`). */
  proficient: boolean;
  requirements: RequirementEntry[];
  type: TemplateType;
};

/** The kind of item a template family makes a feat for. */
export type TemplateType = NonNullable<FeatReference["mapping"][string]["template"]>["type"];

/** The content's list a template family of each type is made over, as the generated code names it. */
const FAMILY_OPTIONS: Record<TemplateType, string> = {
  crossbow: "CROSSBOW_WEAPONS",
  school: "MAGIC_SCHOOLS",
  skill: "SKILL_NAMES",
  weapon: "ALL_WEAPONS",
};

/** The weapon families made over their own weapons, not every weapon: a proficiency's. */
const OWN_WEAPONS: Record<string, string> = { "Exotic Weapon Proficiency": "EXOTIC_WEAPONS" };

/** The weapon families whose feats require proficiency with their weapon (SRD: "Proficiency with weapon"). */
const PROFICIENT_FAMILIES = new Set(["Improved Critical", "Weapon Focus"]);

/**
 * What a feat reference makes: its feats by feat type, and its template families. An epic feat is left out unless an
 * override keeps it.
 */
export function buildReferenceFeats(ref: FeatReference) {
  const kept: FeatEntry[] = [];
  for (const entry of ref.raw) {
    const mapped = ref.mapping[entry.name];
    if (!mapped || mapped.skip) continue;
    if (entry.featType === "epic" && ref.overrides?.[entry.name]?.skip !== false) continue;
    kept.push({ entry, detected: ref.detected[entry.name], mapped });
  }

  const byType = new Map<string, FeatSeed[]>();
  const templates: TemplateFamily[] = [];
  for (const { entry, detected, mapped } of kept) {
    if (mapped.template) {
      const { type, familyName } = mapped.template;
      templates.push({
        type,
        familyName,
        aptitudes: mapped.aptitudes ?? [],
        requirements: mapped.requirements ?? [],
        featNameMap: { ...(detected?.featNameMap ?? {}), ...(mapped.featNameMap ?? {}) },
        modifiers: mapped.modifiers ?? [],
        description: mapped.description ?? entry.benefit,
        options: OWN_WEAPONS[familyName] ?? FAMILY_OPTIONS[type],
        proficient: PROFICIENT_FAMILIES.has(familyName),
      });
      continue;
    }
    const name = normalizeName(entry.name);
    const feats = byType.get(entry.featType) ?? [];
    byType.set(entry.featType, feats);
    feats.push({
      name,
      description: normalizeDescription(mapped.description ?? entry.benefit),
      ...(mapped.stackable ? { stackable: true } : {}),
      ...(mapped.selectable === false ? { selectable: false } : {}),
      aptitudes: mapped.aptitudes ?? [],
      requirements: mapped.requirements ?? [],
      modifiers: [
        ...(mapped.modifiers ?? []),
        ...readCompanionGrantModifiers(name, mapped.description ?? entry.benefit ?? ""),
      ],
      properties: mapped.properties ?? [],
    });
  }
  return {
    byType,
    templates,
    templateNames: new Set(kept.filter(({ mapped }) => mapped.template).map(({ entry }) => entry.name)),
  };
}

/**
 * A feat reference's feats as the aptitude list reads them (names, aptitudes, modifiers): a template family once, as
 * its feats share their aptitudes and their modifiers only differ in the item they target.
 */
export function getFeatAptitudeSources(ref: FeatReference): Pick<FeatSeed, "name" | "aptitudes" | "modifiers">[] {
  const { byType, templates } = buildReferenceFeats(ref);
  return [
    ...[...byType.values()].flat(),
    ...templates.map(({ familyName, aptitudes, modifiers }) => ({ name: familyName, aptitudes, modifiers })),
  ];
}

/**
 * `requirements`, each check of a family by its own name (Daring Warrior's "Weapon Specialization"), which no feat
 * has, made a check of any of its feats. A count of a family by its name (a prestige class's "Sneak attack +2d6") is
 * the family's own: how many times the character has its feats, every class's sneak attack dice together.
 */
export function resolveFamilyChecks(requirements: RequirementEntry[], families: Set<string>): RequirementEntry[] {
  const slugs = new Set([...families].map(stripSeparators));
  const anyOf = (entry: RequirementEntry): RequirementEntry => {
    if ("chainingOperator" in entry) return { ...entry, children: entry.children.map(anyOf) };
    const [, slug] = /^feats\.([^.]+)\.possessed$/.exec(entry.target) ?? [];
    return slug && slugs.has(slug) ? { ...entry, target: `feats.${slug}.*.possessed` } : entry;
  };
  return requirements.map(anyOf);
}
