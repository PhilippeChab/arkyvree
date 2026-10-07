import BookLayout from "@/database/packages/dnd35-from-parser/tools/generator/BookLayout.ts";
import type { BaseCodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/BaseCodeFile.ts";
import type { ClassSeed } from "@/database/packages/dnd35/content/classes/types.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Writing a class: its seed, field by field, as the list its file exports. */
export function WritesClasses<B extends Constructor<BaseCodeFile>>(Base: B) {
  abstract class WritingClasses extends Base {
    /** The class's aptitude picks. */
    private writeAptitudePicks(seed: ClassSeed) {
      const { aptitudePicks } = seed;
      if (!aptitudePicks) return;
      this.lines.push(`  aptitudePicks: [`);
      for (const pick of aptitudePicks)
        this.lines.push(`    { levels: [${pick.levels.join(", ")}], target: ${this.quote(pick.target)} },`);

      this.lines.push(`  ],`);
    }

    /** The class's spellcasting: its bonus spells' ability and its caster type. */
    private writeCasting(seed: ClassSeed) {
      const { bonusSpellAbility, casterType } = seed;
      if (bonusSpellAbility) this.lines.push(`  bonusSpellAbility: ${this.quote(bonusSpellAbility)},`);
      if (casterType) this.lines.push(`  casterType: ${this.quote(casterType)},`);
    }

    /** The class's features by level, its proficiencies, and the feats it gives. */
    private writeFeatures(seed: ClassSeed) {
      const { classFeatures, freeFeats, proficiencies } = seed;
      if (classFeatures) {
        this.lines.push(`  classFeatures: [`);
        for (const [level, name] of classFeatures) this.lines.push(`    [${level}, ${this.quote(name)}],`);
        this.lines.push(`  ],`);
      }
      if (proficiencies) this.lines.push(`  proficiencies: ${this.formatStringArray(proficiencies, 1)},`);
      if (freeFeats) {
        this.lines.push(`  freeFeats: [`);
        for (const [level, feat, apt] of freeFeats)
          this.lines.push(`    [${level}, ${this.quote(feat)}, ${this.quote(apt)}],`);
        this.lines.push(`  ],`);
      }
    }

    /** The class's modifiers, each at its level, with the requirements that gate it. */
    private writeModifiers(seed: ClassSeed) {
      const { modifiers } = seed;
      if (!modifiers) return;
      this.lines.push(`  modifiers: [`);
      for (const m of modifiers)
        this.lines.push(`    { ${[`level: ${m.level}`, ...this.modifierFields(m)].join(", ")} },`);

      this.lines.push(`  ],`);
    }

    /** The class's spells: its slots per day and spells known by level, and the lists it casts from. */
    private writeSpells(seed: ClassSeed) {
      const { spells } = seed;
      if (!spells) return;
      this.lines.push(`  spells: {`);
      this.lines.push(`    slug: ${this.quote(spells.slug)},`);
      this.lines.push(`    perDay: [`);
      for (const row of spells.perDay) this.lines.push(`      [${row.join(", ")}],`);
      this.lines.push(`    ],`);
      if (spells.known) {
        this.lines.push(`    known: [`);
        for (const row of spells.known) this.lines.push(`      [${row.join(", ")}],`);
        this.lines.push(`    ],`);
      }
      if (spells.knowAll) this.lines.push(`    knowAll: true,`);
      if (spells.noCantrips) this.lines.push(`    noCantrips: true,`);
      if (spells.lists) {
        this.lines.push(`    lists: [`);
        for (const list of spells.lists) {
          const requirements = list.requirements.map((r) => this.requirement(r, 3));
          this.lines.push(`      { slug: ${this.quote(list.slug)}, requirements: [${requirements.join(", ")}] },`);
        }
        this.lines.push(`    ],`);
      }
      this.lines.push(`  },`);
    }

    /** The class's opening fields: its name and description, hit die, levels, skills, BAB, saves and requirements. */
    private writeSummary(seed: ClassSeed) {
      const { bab, classSkills, description, hd, levels, name, requirements, saves, skillPoints } = seed;
      this.lines.push(`export const ${BookLayout.classFile(name).list}: ClassSeed = {`);
      this.lines.push(`  name: ${this.quote(name)},`);
      this.lines.push(`  description: ${this.quote(description)},`);
      this.lines.push(`  hd: ${hd}, levels: ${levels}, skillPoints: ${skillPoints},`);
      this.lines.push(`  bab: ${this.quote(bab)},`);
      this.lines.push(
        `  saves: { fortitude: ${this.quote(saves.fortitude)}, reflex: ${this.quote(saves.reflex)}, will: ${this.quote(saves.will)} },`,
      );
      this.lines.push(`  classSkills: ${this.formatStringArray(classSkills, 1)},`);
      this.lines.push(
        ...this.listField(
          "requirements",
          (requirements ?? []).map((req) => this.requirement(req, 2)),
          "  ",
        ),
      );
    }

    /**
     * A class's seed written as code, the list its file exports (`BookLayout.classFile`), and the content type it's of.
     */
    classSeed(seed: ClassSeed): void {
      const { casterLevelAdvancement, classFeatureAptitude } = seed;
      this.writeSummary(seed);
      if (casterLevelAdvancement) {
        const { type, levels } = casterLevelAdvancement;
        this.lines.push(`  casterLevelAdvancement: { type: ${this.quote(type)}, levels: [${levels.join(", ")}] },`);
      }
      if (classFeatureAptitude) this.lines.push(`  classFeatureAptitude: ${this.quote(classFeatureAptitude)},`);
      this.writeFeatures(seed);
      this.writeCasting(seed);
      this.writeSpells(seed);
      this.writeModifiers(seed);
      this.writeAptitudePicks(seed);
      this.lines.push(`};`);
      this.lines.push("");
      this.declare("ClassSeed");
    }
  }
  return WritingClasses;
}
