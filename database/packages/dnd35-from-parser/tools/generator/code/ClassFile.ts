import { CodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/CodeFile.ts";
import {
  formatStringArray,
  listField,
  quote,
  toConstName,
} from "@/database/packages/dnd35-from-parser/tools/generator/code/literals.ts";
import type { ClassSeed } from "@/database/packages/dnd35/content/classes/types.ts";

/**
 * A class's file (classes/<slug>.ts): its seed (`buildClassSeed`) written field by field, and the requirement builders
 * its checks are written with, which its imports are written from.
 */
export class ClassFile extends CodeFile {
  constructor(private readonly seed: ClassSeed) {
    super();
  }

  /** The class's aptitude picks. */
  private writeAptitudePicks() {
    const { aptitudePicks } = this.seed;
    if (!aptitudePicks) return;
    this.lines.push(`  aptitudePicks: [`);
    for (const pick of aptitudePicks) {
      this.lines.push(`    { levels: [${pick.levels.join(", ")}], target: ${quote(pick.target)} },`);
    }
    this.lines.push(`  ],`);
  }

  /** The class's spellcasting: its bonus spells' ability and its caster type. */
  private writeCasting() {
    const { bonusSpellAbility, casterType } = this.seed;
    if (bonusSpellAbility) this.lines.push(`  bonusSpellAbility: ${quote(bonusSpellAbility)},`);
    if (casterType) this.lines.push(`  casterType: ${quote(casterType)},`);
  }

  /** The class's features by level, its proficiencies, and the feats it gives. */
  private writeFeatures() {
    const { classFeatures, freeFeats, proficiencies } = this.seed;
    if (classFeatures) {
      this.lines.push(`  classFeatures: [`);
      for (const [level, name] of classFeatures) this.lines.push(`    [${level}, ${quote(name)}],`);
      this.lines.push(`  ],`);
    }
    if (proficiencies) this.lines.push(`  proficiencies: ${formatStringArray(proficiencies, 1)},`);
    if (freeFeats) {
      this.lines.push(`  freeFeats: [`);
      for (const [level, feat, apt] of freeFeats) this.lines.push(`    [${level}, ${quote(feat)}, ${quote(apt)}],`);
      this.lines.push(`  ],`);
    }
  }

  /** The class's modifiers, each at its level, with the requirements that gate it. */
  private writeModifiers() {
    const { modifiers } = this.seed;
    if (!modifiers) return;
    this.lines.push(`  modifiers: [`);
    for (const m of modifiers) {
      const requirements = (m.requirements ?? []).map((r) => this.requirement(r, 3));
      const gate = requirements.length > 0 ? `, requirements: [${requirements.join(", ")}]` : "";
      this.lines.push(
        `    { level: ${m.level}, target: ${quote(m.target)}, value: ${quote(m.value)}, valueType: ${quote(m.valueType)}, operator: ${quote(m.operator)}${gate} },`,
      );
    }
    this.lines.push(`  ],`);
  }

  /** The class's spells: its slots per day and spells known by level, and the lists it casts from. */
  private writeSpells() {
    const { spells } = this.seed;
    if (!spells) return;
    this.lines.push(`  spells: {`);
    this.lines.push(`    slug: ${quote(spells.slug)},`);
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
        this.lines.push(`      { slug: ${quote(list.slug)}, requirements: [${requirements.join(", ")}] },`);
      }
      this.lines.push(`    ],`);
    }
    this.lines.push(`  },`);
  }

  /** The class's opening fields: its name and description, hit die, levels, skills, BAB, saves and requirements. */
  private writeSummary() {
    const { bab, classSkills, description, hd, levels, name, requirements, saves, skillPoints } = this.seed;
    this.lines.push(`export const ${toConstName(name)}: ClassSeed = {`);
    this.lines.push(`  name: ${quote(name)},`);
    this.lines.push(`  description: ${quote(description)},`);
    this.lines.push(`  hd: ${hd}, levels: ${levels}, skillPoints: ${skillPoints},`);
    this.lines.push(`  bab: ${quote(bab)},`);
    this.lines.push(
      `  saves: { fortitude: ${quote(saves.fortitude)}, reflex: ${quote(saves.reflex)}, will: ${quote(saves.will)} },`,
    );
    this.lines.push(`  classSkills: ${formatStringArray(classSkills, 1)},`);
    this.lines.push(
      ...listField(
        "requirements",
        (requirements ?? []).map((req) => this.requirement(req, 2)),
        "  ",
      ),
    );
  }

  /** The class's file: its fields, and the imports of what its checks use. */
  classCode(): string {
    const { casterLevelAdvancement, classFeatureAptitude } = this.seed;
    this.writeSummary();
    if (casterLevelAdvancement) {
      const { type, levels } = casterLevelAdvancement;
      this.lines.push(`  casterLevelAdvancement: { type: ${quote(type)}, levels: [${levels.join(", ")}] },`);
    }
    if (classFeatureAptitude) this.lines.push(`  classFeatureAptitude: ${quote(classFeatureAptitude)},`);
    this.writeFeatures();
    this.writeCasting();
    this.writeSpells();
    this.writeModifiers();
    this.writeAptitudePicks();
    this.lines.push(`};`);
    this.lines.push("");
    return this.code([`import type { ClassSeed } from "@/database/packages/dnd35/content/classes/types.ts";`]);
  }
}
