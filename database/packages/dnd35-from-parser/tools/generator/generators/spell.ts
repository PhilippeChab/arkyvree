import type { SpellSeedWithLevel } from "@/database/packages/dnd35-from-parser/tools/buildSeeds.ts";
import { escapeString } from "@/database/packages/dnd35-from-parser/tools/generator/codegen.ts";

// ---------------------------------------------------------------------------
// Generate PowerSeed[] TypeScript files from a SpellReference
// Produces one file per spell level (cantrips.ts, level1.ts, ..., level9.ts)
// ---------------------------------------------------------------------------

export function generateSpellFiles(spells: SpellSeedWithLevel[], book?: string): Map<string, string> {
  const byLevel = new Map<number, SpellSeedWithLevel[]>();
  for (const spell of spells) {
    const existing = byLevel.get(spell.level) ?? [];
    existing.push(spell);
    byLevel.set(spell.level, existing);
  }

  const files = new Map<string, string>();
  for (const [level, levelSpells] of [...byLevel.entries()].sort((a, b) => a[0] - b[0])) {
    const filename = level === 0 ? "cantrips.ts" : `level${level}.ts`;
    const constName = level === 0 ? "CANTRIPS" : `LEVEL_${level}_SPELLS`;
    files.set(filename, generateLevelFile(constName, levelSpells));
  }

  // Generate index.ts
  files.set("index.ts", generateIndexFile(byLevel, book));

  return files;
}

function generateLevelFile(constName: string, spells: SpellSeedWithLevel[]): string {
  const lines: string[] = [];
  lines.push(`import type { PowerSeed } from "@/database/packages/dnd35/v1/spells/types.ts";`);
  lines.push(``);
  lines.push(`export const ${constName}: PowerSeed[] = [`);

  for (const spell of spells) {
    lines.push(`  {`);
    lines.push(`    name: "${escapeString(spell.name)}",`);
    lines.push(`    description: "${escapeString(spell.description)}",`);

    const aptStrings = spell.aptitudes.map((a) => `"${a}"`).join(", ");
    lines.push(`    aptitudes: [${aptStrings}],`);

    if (spell.aptitudeLevels && Object.keys(spell.aptitudeLevels).length > 0) {
      const entries = Object.entries(spell.aptitudeLevels)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `"${k}": ${v}`)
        .join(", ");
      lines.push(`    aptitudeLevels: { ${entries} },`);
    }

    if (spell.savingThrow) {
      lines.push(`    savingThrow: "${escapeString(spell.savingThrow)}",`);
    }

    lines.push(`    properties: [`);
    for (const prop of spell.properties) {
      lines.push(`      { type: "${prop.type}", value: "${escapeString(prop.value)}" },`);
    }
    lines.push(`    ],`);
    lines.push(`  },`);
  }

  lines.push(`];`);
  lines.push(``);

  return lines.join("\n");
}

function generateIndexFile(byLevel: Map<number, SpellSeedWithLevel[]>, book?: string): string {
  const lines: string[] = [];

  lines.push(`import {`);
  lines.push(`  abilitiesInRules,`);
  lines.push(`  aptitudesInRules,`);
  lines.push(`  rulesetsInRules,`);
  lines.push(`  savesInRules,`);
  lines.push(`} from "@/drizzle/schema.ts";`);
  lines.push(`import { eq } from "drizzle-orm";`);
  lines.push(`import type { Db } from "@/server/database/index.ts";`);
  lines.push(`import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";`);
  lines.push(`import { buildClassDcAbility, seedPowers } from "@/database/packages/dnd35/seed-utils.ts";`);
  lines.push(`import { ALL_CLASSES } from "@/database/packages/dnd35-from-parser/generated/${book}/classes/index.ts";`);
  lines.push(`import type { PowerSeed } from "@/database/packages/dnd35/v1/spells/types.ts";`);

  const imports: string[] = [];
  const allPowersEntries: string[] = [];

  for (const level of [...byLevel.keys()].sort((a, b) => a - b)) {
    const constName = level === 0 ? "CANTRIPS" : `LEVEL_${level}_SPELLS`;
    const filename = level === 0 ? "cantrips" : `level${level}`;
    const importBase = book
      ? `@/database/packages/dnd35-from-parser/generated/${book}/spells`
      : `@/database/packages/dnd35-from-parser/tools/generator/generators`;
    imports.push(`import { ${constName} } from "${importBase}/${filename}.ts";`);
    allPowersEntries.push(`  ...${constName}.map((p) => ({ ...p, level: ${level} })),`);
  }

  lines.push(...imports);
  lines.push(``);
  lines.push(`type PowerSeedWithLevel = PowerSeed & { level: number };`);
  lines.push(``);
  lines.push(`export const ALL_SPELLS: PowerSeedWithLevel[] = [`);
  lines.push(...allPowersEntries);
  lines.push(`];`);
  lines.push(``);
  lines.push(`export async function seedAllPowers(db: Db) {`);
  lines.push(`  const [ruleset] = await db`);
  lines.push(`    .select({ id: rulesetsInRules.id })`);
  lines.push(`    .from(rulesetsInRules)`);
  lines.push(`    .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));`);
  lines.push(``);
  lines.push(`  const [aptitudes, saves, abilities] = await Promise.all([`);
  lines.push(`    db`);
  lines.push(`      .select({ id: aptitudesInRules.id, name: aptitudesInRules.name })`);
  lines.push(`      .from(aptitudesInRules)`);
  lines.push(`      .where(eq(aptitudesInRules.rulesetId, ruleset.id)),`);
  lines.push(`    db`);
  lines.push(`      .select({ id: savesInRules.id, name: savesInRules.name })`);
  lines.push(`      .from(savesInRules)`);
  lines.push(`      .where(eq(savesInRules.rulesetId, ruleset.id)),`);
  lines.push(`    db`);
  lines.push(`      .select({ id: abilitiesInRules.id, name: abilitiesInRules.name })`);
  lines.push(`      .from(abilitiesInRules)`);
  lines.push(`      .where(eq(abilitiesInRules.rulesetId, ruleset.id)),`);
  lines.push(`  ]);`);
  lines.push(``);
  lines.push(`  const aptMap = Object.fromEntries(aptitudes.map((a) => [a.name, a.id]));`);
  lines.push(`  const saveMap = Object.fromEntries(saves.map((s) => [s.name, s.id]));`);
  lines.push(`  const abilityMap = Object.fromEntries(abilities.map((a) => [a.name, a.id]));`);
  lines.push(``);
  lines.push(`  await seedPowers(db, ruleset.id, ALL_SPELLS, {`);
  lines.push(`    aptMap,`);
  lines.push(`    saveMap,`);
  lines.push(`    classDcAbility: buildClassDcAbility(abilityMap, ALL_CLASSES),`);
  lines.push(`  });`);
  lines.push(`}`);
  lines.push(``);

  return lines.join("\n");
}
