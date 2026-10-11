import { type BaseBookGenerator } from "@/codegen/dnd3.5/tools/generator/BaseBookGenerator.ts";
import BookLayout from "@/codegen/dnd3.5/tools/generator/BookLayout.ts";
import type { SpellReference } from "@/codegen/dnd3.5/tools/types/spells.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Generating a book's spells: a file per spell level. */
export function GeneratesSpells<B extends Constructor<BaseBookGenerator>>(Base: B) {
  abstract class GeneratingSpells extends Base {
    /** A spell reference's files, one per spell level with spells. */
    writeSpells(ref: SpellReference) {
      const spells = this.seeds.spells(ref).seeds();
      this.log(`Built ${spells.length} spell seeds`);

      // A spell above 9th level would have no file: the app has no epic spells
      const beyond = spells.find((spell) => !BookLayout.spellLevels.includes(spell.level));
      if (beyond) throw new Error(`${beyond.name}: level ${beyond.level}, where a spell's is 0 to 9`);

      // A file per spell level, its spells without their level (its file's)
      const byLevel = Map.groupBy(spells, (spell) => spell.level);
      for (const level of BookLayout.spellLevels) {
        const { path, list } = BookLayout.spellFile(level);
        const levelSpells = byLevel.get(level);
        if (levelSpells) this.writeList(path, list, "PowerSeed", levelSpells, (file, spell) => file.spell(spell));
      }
    }
  }
  return GeneratingSpells;
}
