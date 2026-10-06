/**
 * A domain reference's seeds: its DomainDefinition[], and the FeatSeed[] of its feat pools (a War Domain Weapon feat
 * per martial weapon).
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { REFERENCE_DIR } from "@/database/packages/dnd35-from-parser/tools/referenceFiles.ts";
import ReferenceLoader from "@/database/packages/dnd35-from-parser/tools/referenceLoader.ts";
import { type DomainReference } from "@/database/packages/dnd35-from-parser/tools/types/domains.ts";
import type { ModifierSeed } from "@/database/packages/dnd35/content/customization/types.ts";
import type { DomainDefinition } from "@/database/packages/dnd35/content/domains/types.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";
import {
  ALL_WEAPONS,
  EXOTIC_WEAPONS,
  MARTIAL_WEAPONS,
  SIMPLE_WEAPONS,
} from "@/database/packages/dnd35/data/weapons.ts";
import { FEAT_FAMILY } from "@/shared/dnd3.5/properties/index.ts";
import { stripSeparators } from "@/shared/text.ts";

function buildDomainFeatPoolSeeds(ref: DomainReference): FeatSeed[] {
  const results: FeatSeed[] = [];

  for (const entry of ref.raw) {
    const mapping = ref.mapping?.[entry.name];
    const pool = mapping?.featPool;
    if (!pool) continue;

    const items = resolveFeatPoolItems(pool.items);

    for (const item of items) {
      const itemSlug = stripSeparators(item);

      const modifiers: ModifierSeed[] = pool.grants.map((family) => ({
        target: `feats.${stripSeparators(family)}${itemSlug}.possessed`,
        operator: "set",
        value: "true",
        valueType: "boolean",
      }));

      const properties = pool.grants.map((family) => ({
        type: FEAT_FAMILY,
        value: family,
      }));

      const description = pool.description
        ? pool.description.replace(/\$\{w\}/g, item)
        : `Granted by the ${entry.name} domain.`;

      results.push({
        name: `${pool.namePrefix}: ${item}`,
        description,
        generated: true,
        aptitudes: [pool.aptitude],
        modifiers,
        properties,
      });
    }
  }

  return results;
}

/** A domain of the domains reference, as its mapping and overrides make it. */
function domainSeed(ref: DomainReference, entry: DomainReference["raw"][number]): DomainDefinition {
  const mapping = ref.mapping?.[entry.name];
  const override = ref.overrides?.[entry.name];
  const spellSource = override?.spells ?? entry.spells;

  return {
    name: override?.name ?? entry.name,
    description: mapping?.description ?? entry.description,
    ...(mapping?.modifiers?.length ? { modifiers: mapping.modifiers } : {}),
    spells: spellSource
      .map((s) => ({ name: s.name, level: s.level }))
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
  };
}

/**
 * A domains reference's domains, as their mapping and overrides make them, their spells named as the spell references
 * name them. `parser:validate` reports a spell neither the core rules nor the book has.
 */
function domainSeeds(ref: DomainReference): DomainDefinition[] {
  const spellNames = getDomainSpellNames(ref._meta.book);
  const seeds = ref.raw.map((entry) => domainSeed(ref, entry));
  for (const seed of seeds) {
    for (const spell of seed.spells) spell.name = spellNames.get(spell.name.toLowerCase()) ?? spell.name;
  }
  return seeds;
}

function resolveFeatPoolItems(items: "martial" | "simple" | "exotic" | "all" | string[]): string[] {
  if (Array.isArray(items)) return items;
  switch (items) {
    case "martial":
      return MARTIAL_WEAPONS;
    case "simple":
      return SIMPLE_WEAPONS;
    case "exotic":
      return EXOTIC_WEAPONS;
    case "all":
      return ALL_WEAPONS;
  }
}

/** A book's domains as it prints them (`reference/<book>/domains.json`; none for a book without), and their feat pools' feats. */
export function buildBookDomainSeeds(book: string): { seeds: DomainDefinition[]; poolFeats: FeatSeed[] } {
  const path = join(REFERENCE_DIR, book, "domains.json");
  if (!existsSync(path)) return { seeds: [], poolFeats: [] };
  const ref = ReferenceLoader.load(path, "domain");
  return { seeds: domainSeeds(ref), poolFeats: buildDomainFeatPoolSeeds(ref) };
}

/**
 * What a domains reference's lists lack, as generated: a spell neither the core rules nor the book has (the seed
 * leaves it out), a spell level from 1st to 9th without a spell, and a spell of the book whose level line puts it on
 * one of them at a level the list doesn't. An override of the domain's spells corrects them.
 */
export function findDomainSpellIssues(ref: DomainReference): { domain: string; text: string }[] {
  const spellNames = getDomainSpellNames(ref._meta.book);
  const spellsPath = join(REFERENCE_DIR, ref._meta.book, "spells.json");
  const bookSpells = existsSync(spellsPath) ? ReferenceLoader.load(spellsPath, "spell").raw : [];
  const issues: { domain: string; text: string }[] = [];
  for (const { name: domain, spells } of domainSeeds(ref)) {
    const has = (name: string, level: number) =>
      spells.some((spell) => spell.level === level && spell.name.toLowerCase() === name.toLowerCase());
    for (const spell of spells) {
      if (!spellNames.has(spell.name.toLowerCase())) {
        issues.push({ domain, text: `${spell.name} (level ${spell.level}) is no spell of the core rules or the book` });
      }
    }
    for (let level = 1; level <= 9; level++) {
      if (!spells.some((spell) => spell.level === level)) issues.push({ domain, text: `no spell at level ${level}` });
    }
    for (const spell of bookSpells) {
      for (const { className, level } of spell.levelEntries) {
        if (className === domain && !has(spell.name, level)) {
          issues.push({ domain, text: `the book's ${spell.name} is ${domain} ${level}, not on its list` });
        }
      }
    }
  }
  return issues;
}

/** The spells a book's domains can name, by their lowercase name: the core rules' and the book's. */
export function getDomainSpellNames(book: string): Map<string, string> {
  const spellNames = (b: string) => {
    const path = join(REFERENCE_DIR, b, "spells.json");
    return existsSync(path) ? ReferenceLoader.load(path, "spell").raw.map((spell) => spell.name) : [];
  };
  return new Map(
    [...spellNames("srd"), ...(book === "srd" ? [] : spellNames(book))].map((name) => [name.toLowerCase(), name]),
  );
}
