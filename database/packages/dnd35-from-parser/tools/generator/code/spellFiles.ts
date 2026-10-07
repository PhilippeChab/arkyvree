/** Generates a spell reference's PowerSeed[] files: one per spell level (cantrips.ts, level1.ts, …, level9.ts). */

import { CodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/CodeFile.ts";
import type { SpellSeed } from "@/database/packages/dnd35/content/spells/types.ts";

/** A spell reference's files, by file name: a list of its spells per spell level, sorted by level. */
export function generateSpellFiles(spells: SpellSeed[]): Map<string, string> {
  const byLevel = Map.groupBy(spells, (spell) => spell.level);
  const files = new Map<string, string>();
  for (const [level, levelSpells] of [...byLevel.entries()].sort((a, b) => a[0] - b[0])) {
    const file = new CodeFile();
    file.list(
      level === 0 ? "CANTRIPS" : `LEVEL_${level}_SPELLS`,
      "PowerSeed",
      levelSpells.flatMap((spell) => file.spell(spell)),
    );
    files.set(level === 0 ? "cantrips.ts" : `level${level}.ts`, file.code());
  }
  return files;
}
