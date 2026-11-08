import BookLayout from "@/codegen/dnd5/tools/generator/BookLayout.ts";
import type { BaseCodeFile } from "@/codegen/dnd5/tools/generator/code/BaseCodeFile.ts";
import type { ClassSeed } from "@/content/dnd5/builders/classes/types.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Writing a class: its seed, field by field, as the list its file exports. */
export function WritesClasses<B extends Constructor<BaseCodeFile>>(Base: B) {
  abstract class WritingClasses extends Base {
    /** The class's features by level, each a feat granted through its feature pool. */
    private writeFeatures({ featurePool, features }: ClassSeed) {
      this.lines.push(`  featurePool: ${this.quote(featurePool)},`);
      this.lines.push(`  features: [`);
      for (const [level, name] of features) this.lines.push(`    [${level}, ${this.quote(name)}],`);
      this.lines.push(`  ],`);
    }

    /** The class's single links, by the names of what they link: its spellcasting ability, its proficiencies' feats. */
    private writeLinks({ links }: ClassSeed) {
      const written = Object.entries(links ?? {})
        .filter(([, name]) => name !== undefined)
        .sort(([a], [b]) => this.compareNames(a, b))
        .map(([role, name]) => `${role}: ${this.quote(name)}`);
      if (written.length > 0) this.lines.push(`  links: { ${written.join(", ")} },`);
    }

    /** The class's levels' modifiers, each at its level, with the requirements that gate it. */
    private writeModifiers({ modifiers }: ClassSeed) {
      if (!modifiers) return;
      this.lines.push(`  modifiers: [`);
      for (const m of modifiers)
        this.lines.push(`    { ${[`level: ${m.level}`, ...this.modifierFields(m)].join(", ")} },`);
      this.lines.push(`  ],`);
    }

    /**
     * The class's spells: its list, the spells it has at each spell level by each of its levels, and the pools that draw
     * from its list (a warlock's Mystic Arcanum's).
     */
    private writeSpells({ spells }: ClassSeed) {
      if (!spells) return;
      this.lines.push(`  spells: {`);
      this.lines.push(`    list: ${this.quote(spells.list)},`);
      this.lines.push(`    known: [`);
      for (const row of spells.known) this.lines.push(`      [${row.join(", ")}],`);
      this.lines.push(`    ],`);
      if (spells.drawnBy) {
        this.lines.push(`    drawnBy: [`);
        for (const { level, pool } of spells.drawnBy)
          this.lines.push(`      { pool: ${this.quote(pool)}, level: ${level} },`);
        this.lines.push(`    ],`);
      }
      this.lines.push(`  },`);
    }

    /**
     * A class's seed written as code, the list its file exports (`BookLayout.classFile`): its name, description and
     * fields, links, skills, features, modifiers, requirements and spells.
     */
    classSeed(seed: ClassSeed): void {
      const { classSkills, description, fields, name, requirements } = seed;
      this.lines.push(`export const ${BookLayout.classFile(name).list}: ClassSeed = {`);
      this.lines.push(`  name: ${this.quote(name)},`);
      this.lines.push(`  description: ${this.quote(description)},`);
      this.lines.push(`  fields: ${this.seedFields(fields)},`);
      this.writeLinks(seed);
      this.lines.push(`  classSkills: ${this.formatStringArray(classSkills, 1)},`);
      this.writeFeatures(seed);
      this.writeModifiers(seed);
      this.lines.push(
        ...this.listField(
          "requirements",
          (requirements ?? []).map((requirement) => this.requirement(requirement, 2)),
          "  ",
        ),
      );
      this.writeSpells(seed);
      this.lines.push(`};`, "");
      this.declare("ClassSeed");
    }
  }
  return WritingClasses;
}
