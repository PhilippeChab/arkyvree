/**
 * One-shot cleanup script: removes redundant mapping.overrides entries
 * from class reference JSON files.
 *
 * An override is redundant when it duplicates a value already present
 * in `mapping` or `detected`, since the generator would produce
 * identical output without it.
 *
 * For overrides.features, the comparison target is what buildInitialMapping()
 * would auto-generate (plus post-processing normalizations), NOT the current
 * mapping.features — because mapping.features may already have overrides applied.
 *
 * Usage: bun database/packages/dnd35-from-parser/tools/cleanupOverrides.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { globSync } from "glob";
import { buildDetected, buildInitialMapping } from "@/database/packages/dnd35-from-parser/tools/scraper/detectClass.ts";
import type { ClassReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";
import { sortKeysDeep, deepEqual } from "@/database/packages/dnd35-from-parser/tools/shared.ts";

const REF_GLOB = "database/packages/dnd35-from-parser/reference/*/classes/*.json";

/**
 * Build the auto-generated features for a class reference, matching what the
 * scraper would produce from scratch. Since buildInitialMapping() now produces
 * the final result directly (no post-processing pass needed), just call it.
 */
function buildAutoFeatures(ref: ClassReference): Record<string, Record<string, unknown>> {
  const detected = buildDetected(ref.raw);
  const initialMapping = buildInitialMapping(ref.raw, detected);
  return initialMapping.features as Record<string, Record<string, unknown>>;
}

interface Summary {
  file: string;
  removed: string[];
}

function cleanupFile(filePath: string): Summary | null {
  const text = readFileSync(filePath, "utf-8");
  const ref = JSON.parse(text);

  const mapping = ref.mapping;
  const detected = ref.detected;
  const overrides = mapping?.overrides;

  if (!overrides) return null;

  const removed: string[] = [];

  // --- overrides.spells: remove if deep-equals mapping.spells ---
  if (overrides.spells && mapping.spells && deepEqual(overrides.spells, mapping.spells)) {
    delete overrides.spells;
    removed.push("spells (identical to mapping.spells)");
  }

  // --- overrides.modifiers: remove if empty array ---
  if (Array.isArray(overrides.modifiers) && overrides.modifiers.length === 0) {
    delete overrides.modifiers;
    removed.push("modifiers (empty [])");
  }

  // --- overrides.bonusSpellAbility: remove if equals mapping.bonusSpellAbility ---
  if (
    overrides.bonusSpellAbility !== undefined &&
    overrides.bonusSpellAbility === mapping.bonusSpellAbility
  ) {
    delete overrides.bonusSpellAbility;
    removed.push("bonusSpellAbility (identical to mapping)");
  }

  // --- overrides.requirements: remove if deep-equals detected.requirements ---
  // Keep if there are unresolvedPrereqs, since the key suppresses TODO comments
  if (
    overrides.requirements !== undefined &&
    detected?.requirements !== undefined &&
    deepEqual(overrides.requirements, detected.requirements) &&
    !(detected.unresolvedPrereqs?.length > 0)
  ) {
    delete overrides.requirements;
    removed.push("requirements (identical to detected)");
  }

  // --- overrides.bab: remove if equals detected.bab ---
  if (overrides.bab !== undefined && overrides.bab === detected?.bab) {
    delete overrides.bab;
    removed.push("bab (identical to detected)");
  }

  // --- overrides.saves: remove if deep-equals detected.saves ---
  if (
    overrides.saves !== undefined &&
    detected?.saves !== undefined &&
    deepEqual(overrides.saves, detected.saves)
  ) {
    delete overrides.saves;
    removed.push("saves (identical to detected)");
  }

  // --- overrides.aptitudePicks: remove if deep-equals detected.aptitudePicks ---
  if (
    overrides.aptitudePicks !== undefined &&
    detected?.aptitudePicks !== undefined &&
    deepEqual(overrides.aptitudePicks, detected.aptitudePicks)
  ) {
    delete overrides.aptitudePicks;
    removed.push("aptitudePicks (identical to detected)");
  }

  // --- overrides.casterType: remove if equals detected.casterType ---
  if (
    overrides.casterType !== undefined &&
    overrides.casterType === detected?.casterType
  ) {
    delete overrides.casterType;
    removed.push("casterType (identical to detected)");
  }

  // --- overrides.features: compare against auto-generated features ---
  // The comparison target is what buildInitialMapping() produces (plus
  // post-processing normalizations from the scraper), NOT mapping.features.
  if (overrides.features) {
    const overrideFeatures = overrides.features as Record<string, Record<string, unknown>>;
    const autoFeatures = buildAutoFeatures(ref as ClassReference);
    let featuresRemoved = 0;

    for (const [featName, overrideFields] of Object.entries(overrideFeatures)) {
      const autoFeat = autoFeatures[featName];
      if (!autoFeat) continue;

      // Check each field in the override against the auto-generated feature
      let fieldsRemoved = 0;
      const fieldKeys = Object.keys(overrideFields);
      for (const key of fieldKeys) {
        if (deepEqual(overrideFields[key], autoFeat[key])) {
          delete overrideFields[key];
          fieldsRemoved++;
        }
      }

      // If all fields were redundant, remove the entire feature entry
      if (Object.keys(overrideFields).length === 0) {
        delete overrideFeatures[featName];
        featuresRemoved++;
      } else if (fieldsRemoved > 0) {
        removed.push(
          `features.${featName}: ${fieldsRemoved} redundant field(s)`,
        );
      }
    }

    if (featuresRemoved > 0) {
      removed.push(`features: ${featuresRemoved} fully redundant entry/entries`);
    }

    // If no feature overrides remain, remove the features key
    if (Object.keys(overrideFeatures).length === 0) {
      delete overrides.features;
      removed.push("features (all entries removed)");
    }
  }

  // --- If overrides is now empty, remove it entirely ---
  if (Object.keys(overrides).length === 0) {
    delete mapping.overrides;
    removed.push("overrides (empty after cleanup)");
  }

  if (removed.length === 0) return null;

  // Write back with recursively sorted keys and 2-space indent
  const output = JSON.stringify(sortKeysDeep(ref), null, 2);
  writeFileSync(filePath, output + "\n");

  return { file: filePath, removed };
}

// --- Main ---
const files = globSync(REF_GLOB).sort();
console.log(`Scanning ${files.length} class reference files...\n`);

let totalFiles = 0;
let totalRemoved = 0;

for (const file of files) {
  const summary = cleanupFile(file);
  if (summary) {
    totalFiles++;
    totalRemoved += summary.removed.length;
    console.log(`${summary.file}:`);
    for (const r of summary.removed) {
      console.log(`  - ${r}`);
    }
    console.log();
  }
}

console.log(`Done. Cleaned ${totalFiles} files, removed ${totalRemoved} redundant entries.`);
