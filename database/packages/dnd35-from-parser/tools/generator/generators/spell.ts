import type { SpellSeedWithLevel } from "@/database/packages/dnd35-from-parser/tools/buildSeeds.ts";
import { escapeString } from "@/database/packages/dnd35-from-parser/tools/generator/codegen.ts";

// ---------------------------------------------------------------------------
// Generate PowerSeed[] TypeScript files from a SpellReference
// Produces one file per spell level (cantrips.ts, level1.ts, ..., level9.ts)
// ---------------------------------------------------------------------------

export function generateSpellFiles(spells: SpellSeedWithLevel[]): Map<string, string> {
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

  return files;
}

function generateLevelFile(constName: string, spells: SpellSeedWithLevel[]): string {
  const lines: string[] = [];
  lines.push(`import type { PowerSeed } from "@/database/packages/dnd35/content/types.ts";`);
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
