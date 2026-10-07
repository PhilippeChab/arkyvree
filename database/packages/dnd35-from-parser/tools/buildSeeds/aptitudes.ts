/** Collects the aptitudes a book's seeds use. */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { buildClassFeatSeeds } from "@/database/packages/dnd35-from-parser/tools/buildSeeds/classes/featSeeds.ts";
import {
  buildClassDomainPickFeats,
  getClassSpellLists,
} from "@/database/packages/dnd35-from-parser/tools/buildSeeds/classes/spellSlots.ts";
import { buildBookDomainSeeds } from "@/database/packages/dnd35-from-parser/tools/buildSeeds/domains.ts";
import { buildSpellSeeds } from "@/database/packages/dnd35-from-parser/tools/buildSeeds/spells.ts";
import { buildWizardSchoolSeeds } from "@/database/packages/dnd35-from-parser/tools/buildSeeds/wizardSchools.ts";
import { listReferenceBooks, REFERENCE_DIR } from "@/database/packages/dnd35-from-parser/tools/referenceFiles.ts";
import ReferenceLoader from "@/database/packages/dnd35-from-parser/tools/ReferenceLoader.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";
import { stripSeparators } from "@/shared/text.ts";

type AptitudeSource = Pick<FeatSeed, "name" | "aptitudes" | "modifiers">;

/**
 * The aptitudes a feat's modifier names that no name in `names` has: a class feature's own ("Grace (Duelist)" picks
 * from "Duelist Grace"), or its name's. Added to `names`.
 */
function addModifierAptitudes(feats: AptitudeSource[], names: Set<string>) {
  for (const feat of feats) {
    for (const mod of feat.modifiers ?? []) {
      const slugMatch = mod.target.match(/^aptitudes\.([^.]+)\./);
      if (!slugMatch) continue;
      const slug = slugMatch[1];
      if ([...names].some((n) => stripSeparators(n) === slug)) continue;
      const featParenMatch = feat.name.match(/^(.+?)\s*\(([^)]+)\)$/);
      if (featParenMatch) {
        const candidate = `${featParenMatch[2]} ${featParenMatch[1]}`;
        if (stripSeparators(candidate) === slug) names.add(candidate);
        else if (stripSeparators(featParenMatch[1]) === slug) names.add(featParenMatch[1]);
      }
    }
  }
}

/**
 * The spell lists an extension's own spells are on: a sibling extension's list it keeps (each extension makes its own
 * copy). None for the core rules.
 */
function bookSpellAptitudes(book: string): Set<string> {
  const spellAptitudes = new Set<string>();
  if (book === "srd") return spellAptitudes;
  const spellRefPath = join(REFERENCE_DIR, book, "spells.json");
  if (existsSync(spellRefPath)) {
    const spellRef = ReferenceLoader.load(spellRefPath, "spell");
    const { spells } = buildSpellSeeds(spellRef, book);
    for (const spell of spells) {
      for (const apt of spell.aptitudes) spellAptitudes.add(apt);
    }
  }
  return spellAptitudes;
}

/** A book's domains' aptitudes (Cleric Domain, and their feat pools') and its wizard schools' spell lists. */
function domainAndSchoolAptitudes(book: string): string[] {
  const names: string[] = [];
  // Domain aptitudes: the book's domains, and their feat pools'
  const domains = buildBookDomainSeeds(book);
  if (domains.seeds.length > 0) names.push("Cleric Domain");
  for (const feat of domains.poolFeats) names.push(...feat.aptitudes);

  // Wizard school aptitudes
  const wsRefPath = join(REFERENCE_DIR, book, "wizardSchools.json");
  if (existsSync(wsRefPath)) {
    const wsRef = ReferenceLoader.load(wsRefPath, "wizardSchool");
    for (const school of buildWizardSchoolSeeds(wsRef)) names.push(`${school.name} Specialist Spells`);
  }
  return names;
}

/**
 * Removes from `names` the aptitudes other books' classes create (their class features and spell lists), but a
 * sibling extension's spell list the book's spells are on (`spellAptitudes`).
 */
function removeOtherBooksAptitudes(names: Set<string>, book: string, spellAptitudes: Set<string>) {
  for (const other of listReferenceBooks()) {
    if (other === book) continue;
    const isSibling = other !== "srd" && book !== "srd";
    for (const { ref } of ReferenceLoader.loadClasses(other)) {
      if (ref.mapping.classFeatureAptitude) names.delete(ref.mapping.classFeatureAptitude);
      for (const spellApt of getClassSpellLists(ref)) {
        if (isSibling && spellAptitudes.has(spellApt)) {
          names.add(spellApt);
        } else {
          names.delete(spellApt);
        }
      }
    }
  }
}

/** A book's aptitudes: its feats' (`feats`, and its classes'), its classes' and spell lists', its domains' feat pools. */
export function collectAptitudes(feats: AptitudeSource[], book: string): string[] {
  const names = new Set<string>();

  // Collect all feats: standalone feats + class feature feats from reference JSONs
  const allFeats: AptitudeSource[] = [...feats];
  for (const { ref } of ReferenceLoader.loadClasses(book)) {
    allFeats.push(...buildClassFeatSeeds(ref), ...buildClassDomainPickFeats(ref));
    if (ref.mapping.classFeatureAptitude) names.add(ref.mapping.classFeatureAptitude);
    for (const list of getClassSpellLists(ref)) names.add(list);

    // From detected bonusFeatLists
    if (ref.detected?.bonusFeatLists) {
      for (const list of ref.detected.bonusFeatLists) names.add(list.aptitude);
    }
  }

  // From feat aptitudes
  for (const feat of allFeats) {
    for (const apt of feat.aptitudes) names.add(apt);
  }

  // From feat modifier targets referencing aptitudes
  addModifierAptitudes(allFeats, names);
  for (const name of domainAndSchoolAptitudes(book)) names.add(name);
  removeOtherBooksAptitudes(names, book, bookSpellAptitudes(book));

  return [...names].sort();
}
