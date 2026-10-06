/** A feat reference's feats file, the core rules' favored enemies' file, and a feat's checks of a family. */

import { FeatsFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/FeatsFile.ts";
import { buildReferenceFeats } from "@/database/packages/dnd35-from-parser/tools/generator/code/referenceFeats.ts";
import TemplateFamilies from "@/database/packages/dnd35-from-parser/tools/generator/code/templateFamilies.ts";
import type { FeatReference } from "@/database/packages/dnd35-from-parser/tools/types/feats.ts";
import type { RequirementEntry } from "@/database/packages/dnd35/content/customization/types.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";
import { stripSeparators } from "@/shared/text.ts";

/** What opens a feats file: the seed type's import. */
const FEAT_SEED_IMPORT = `import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";`;

/** The core rules' favored enemy feats file (favoredEnemy.ts). */
export function generateFavoredEnemyFeats(): string {
  const file = new FeatsFile();
  file.emitSystemFeats("favoredEnemy.ts");
  return file.code([FEAT_SEED_IMPORT]);
}

/** A feat reference's FeatSeed[] file. */
export function generateFeatSeeds(ref: FeatReference): string {
  const { byType, templates, templateNames } = buildReferenceFeats(ref);
  const families = TemplateFamilies.requirable(ref._meta.book, templateNames);
  const file = new FeatsFile();

  for (const [type, feats] of byType) {
    file.lines.push(`export const ${type.toUpperCase().replace(/\s+/g, "_")}_FEATS: FeatSeed[] = [`);
    for (const feat of feats) {
      file.lines.push(...file.feat({ ...feat, requirements: resolveFamilyChecks(feat.requirements ?? [], families) }));
    }
    file.lines.push(`];`, "");
  }

  for (const family of templates) file.emitTemplate(family, families);

  // System feats are only generated for the SRD — other books reuse them
  if (ref._meta.book === "srd") {
    file.emitSystemFeats("feats.ts");
  }
  return file.code([FEAT_SEED_IMPORT]);
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
