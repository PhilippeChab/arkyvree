/**
 * A feat reference's feats file, the core rules' favored enemies' file, and the template families a feat can
 * require.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { CLASS_FEAT_FAMILY_NAMES } from "@/database/packages/dnd35-from-parser/tools/buildSeeds/classes.ts";
import {
  FeatsFile,
  type TemplateFamily,
} from "@/database/packages/dnd35-from-parser/tools/generator/code/FeatsFile.ts";
import { autoCompanionGrantModifiers } from "@/database/packages/dnd35-from-parser/tools/grants.ts";
import { normalizeName, toCamelCase } from "@/database/packages/dnd35-from-parser/tools/names.ts";
import { REFERENCE_DIR } from "@/database/packages/dnd35-from-parser/tools/referenceFiles.ts";
import { loadReference } from "@/database/packages/dnd35-from-parser/tools/references.ts";
import { normalizeDescription } from "@/database/packages/dnd35-from-parser/tools/scrapedText.ts";
import type { FeatReference } from "@/database/packages/dnd35-from-parser/tools/types/feats.ts";
import type { RequirementEntry } from "@/database/packages/dnd35/content/customization/types.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";
import { stripSeparators } from "@/shared/text.ts";

type FeatEntry = {
  entry: FeatReference["raw"][number];
  detected: FeatReference["detected"][string];
  mapped: FeatReference["mapping"][string];
};

/** Each book's template families, read once: every class of the book asks for them. */
const bookTemplateNamesCache = new Map<string, Set<string>>();

/** What opens a feats file: the seed type's import. */
const FEAT_SEED_IMPORT = `import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";`;

/** A book's template families, from its feat reference: none for a book without feats. */
function bookTemplateNames(book: string): Set<string> {
  let names = bookTemplateNamesCache.get(book);
  if (!names) {
    const path = join(REFERENCE_DIR, book, "feats.json");
    names = existsSync(path) ? referenceFeats(loadReference(path, "feat")).templateNames : new Set<string>();
    bookTemplateNamesCache.set(book, names);
  }
  return names;
}

/**
 * What a feat reference makes: its feats by feat type, and its template families. An epic feat is left out unless an
 * override keeps it.
 */
function referenceFeats(ref: FeatReference) {
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
        constName: toCamelCase(familyName),
        familyName,
        aptitudes: mapped.aptitudes ?? [],
        requirements: mapped.requirements ?? [],
        featNameMap: { ...(detected?.featNameMap ?? {}), ...(mapped.featNameMap ?? {}) },
        modifiers: mapped.modifiers ?? [],
        description: mapped.description ?? entry.benefit,
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
        ...autoCompanionGrantModifiers(name, mapped.description ?? entry.benefit ?? ""),
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
 * `requirements`, each check of a family by its own name (Daring Warrior's "Weapon Specialization"), which no feat
 * has, made a check of any of its feats. A count of a family by its name (a prestige class's "Sneak attack +2d6") is
 * the family's own: how many times the character has its feats, every class's sneak attack dice together.
 */
export function anyOfFamilies(requirements: RequirementEntry[], families: Set<string>): RequirementEntry[] {
  const slugs = new Set([...families].map(stripSeparators));
  const anyOf = (entry: RequirementEntry): RequirementEntry => {
    if ("chainingOperator" in entry) return { ...entry, children: entry.children.map(anyOf) };
    const [, slug] = /^feats\.([^.]+)\.possessed$/.exec(entry.target) ?? [];
    return slug && slugs.has(slug) ? { ...entry, target: `feats.${slug}.*.possessed` } : entry;
  };
  return requirements.map(anyOf);
}

/**
 * A feat reference's feats as the aptitude list reads them (names, aptitudes, modifiers): a template family once, as
 * its feats share their aptitudes and their modifiers only differ in the item they target.
 */
export function featAptitudeSources(ref: FeatReference): Pick<FeatSeed, "name" | "aptitudes" | "modifiers">[] {
  const { byType, templates } = referenceFeats(ref);
  return [
    ...[...byType.values()].flat(),
    ...templates.map(({ familyName, aptitudes, modifiers }) => ({ name: familyName, aptitudes, modifiers })),
  ];
}

/** The core rules' favored enemy feats file (favoredEnemy.ts). */
export function generateFavoredEnemyFeats(): string {
  const file = new FeatsFile();
  file.emitSystemFeats("favoredEnemy.ts");
  return file.code([FEAT_SEED_IMPORT]);
}

/** A feat reference's FeatSeed[] file. */
export function generateFeatSeeds(ref: FeatReference): string {
  const { byType, templates, templateNames } = referenceFeats(ref);
  const families = requirableFamilies(ref._meta.book, templateNames);
  const file = new FeatsFile();

  for (const [type, feats] of byType) {
    file.lines.push(`export const ${type.toUpperCase().replace(/\s+/g, "_")}_FEATS: FeatSeed[] = [`);
    for (const feat of feats) {
      file.lines.push(...file.feat({ ...feat, requirements: anyOfFamilies(feat.requirements ?? [], families) }));
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
 * The families a book's feats and classes can require: its own templates (`own`), for an extension the core rules'
 * its feats build on (Power Critical requires the SRD's Weapon Focus), and the class features' (Sneak Attack, Rage…).
 */
export function requirableFamilies(book: string, own = bookTemplateNames(book)): Set<string> {
  return new Set([...own, ...(book === "srd" ? [] : bookTemplateNames("srd")), ...CLASS_FEAT_FAMILY_NAMES]);
}
