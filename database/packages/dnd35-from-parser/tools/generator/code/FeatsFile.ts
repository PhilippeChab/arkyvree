import { CodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/CodeFile.ts";
import { CORE_SYSTEM_FEATS } from "@/database/packages/dnd35-from-parser/tools/generator/code/coreSystemFeats.ts";
import {
  type ImportTable,
  REQUIREMENT_IMPORTS,
} from "@/database/packages/dnd35-from-parser/tools/generator/code/imports.ts";
import {
  escapeTemplate,
  listField,
  quote,
} from "@/database/packages/dnd35-from-parser/tools/generator/code/literals.ts";
import type { TemplateFamily, TemplateType } from "@/database/packages/dnd35-from-parser/tools/seeds/feats.ts";
import {
  expandTemplateDescription,
  normalizeDescription,
} from "@/database/packages/dnd35-from-parser/tools/text/scrapedText.ts";
import type {
  ModifierSeed,
  RequirementCondition,
  RequirementEntry,
} from "@/database/packages/dnd35/content/customization/types.ts";
import { FEAT_FAMILY } from "@/shared/dnd3.5/properties/index.ts";

/** Where each name the generated feats use comes from, in the order the imports are written. */
const IMPORTS: ImportTable = [
  ...REQUIREMENT_IMPORTS,
  [
    "@/database/packages/dnd35/content/items/weapons.ts",
    ["ALL_WEAPONS", "SIMPLE_WEAPONS", "MARTIAL_WEAPONS", "EXOTIC_WEAPONS", "CROSSBOW_WEAPONS"],
  ],
  ["@/database/packages/dnd35/content/items/proficiencies.ts", ["proficiencyRequirements"]],
  ["@/database/packages/dnd35/data/feats/weapons.ts", ["spellWeaponFocusFeats", "weaponProficiencyFeats"]],
  ["@/database/packages/dnd35/data/skills.ts", ["SKILL_NAMES"]],
  ["@/shared/dnd3.5/spells.ts", ["MAGIC_SCHOOLS"]],
  ["@/shared/text.ts", ["stripSeparators"]],
  ["@/database/packages/dnd35/content/wizardSchools/schoolFeats.ts", ["wizardSchoolFeats"]],
  ["@/database/packages/dnd35/data/feats/favoredEnemy.ts", ["favoredEnemyFeats"]],
  ["@/database/packages/dnd35-from-parser/generated/srd/wizard-schools/data.ts", ["WIZARD_SCHOOLS"]],
];

/**
 * A feats file: its feats' lists, a template family's feats made per item (weapon, skill, school…), and the core
 * rules' system feats. What its code uses (weapon lists, skill names…) is imported from where the content defines it.
 */
export class FeatsFile extends CodeFile {
  constructor() {
    super(IMPORTS);
  }

  /** Ends a template: its feats' family. */
  private closeTemplate(familyName: string): void {
    this.lines.push(`  properties: [${this.property({ type: FEAT_FAMILY, value: familyName })}],`);
    this.lines.push(`}));`);
    this.lines.push("");
  }

  private emitCrossbowTemplate(family: TemplateFamily): void {
    this.openTemplate(family, "w", this.templateDescription(family, "w"));
    this.emitTemplateModifiers(family.modifiers, (target) => this.weaponTarget(target));
    this.closeTemplate(family.familyName);
  }

  private emitSchoolTemplate(family: TemplateFamily, families: Set<string>): void {
    const { modifiers } = family;
    this.openTemplate(family, "s", this.templateDescription(family, "s"));
    this.emitTemplateRequirements(this.itemRequirementLines(family, family.requirements, "s", families));

    // Use the explicit modifiers from the reference JSON. Re-write any
    // `powers.groups.<placeholder>.` segment to the per-school slug. Other
    // targets (e.g. `skills.spellcraft.misc`) are kept verbatim — schools
    // don't parameterize skill names the way SKILL_NAMES does.
    this.emitTemplateModifiers(modifiers, (target) =>
      target.replace(/powers\.groups\.[^.]+\./, "powers.groups.${stripSeparators(s)}."),
    );
    this.closeTemplate(family.familyName);
  }

  /** A feat per skill: its description and modifiers name the skill (`{skill}`, `skills.skill.…`). */
  private emitSkillTemplate(family: TemplateFamily, families: Set<string>): void {
    this.openTemplate(family, "s", this.templateDescription(family, "s"));
    this.emitTemplateRequirements(this.itemRequirementLines(family, family.requirements, "s", families));
    this.emitTemplateModifiers(family.modifiers, (target) =>
      target.replace(/skills\.[^.]+/, "skills.${stripSeparators(s)}"),
    );
    this.closeTemplate(family.familyName);
  }

  /**
   * A template's modifiers, each target made the item's by `retarget`. A requirement on one throws: its targets would
   * have to be the item's too.
   */
  private emitTemplateModifiers(modifiers: ModifierSeed[], retarget: (target: string) => string): void {
    this.lines.push(
      ...listField(
        "modifiers",
        modifiers.map((m) => {
          if (m.requirements?.length)
            throw new Error(`${m.target}: a template feat's modifier can't have requirements`);
          const target = retarget(escapeTemplate(m.target));
          if (target.includes("${stripSeparators(")) this.uses.add("stripSeparators");
          return this.modifier(m, 2, `\`${target}\``);
        }),
        "  ",
      ),
    );
  }

  /** A template's requirements, when it has some. */
  private emitTemplateRequirements(reqLines: string[]): void {
    if (reqLines.length === 0) return;
    this.lines.push(`  requirements: [`, ...reqLines, `  ],`);
  }

  private emitWeaponTemplate(family: TemplateFamily, families: Set<string>): void {
    const { familyName, requirements, modifiers, proficient } = family;
    this.openTemplate(family, "w", this.templateDescription(family, "w"));

    const reqLines: string[] = [];
    if (proficient) {
      this.uses.add("proficiencyRequirements");
      reqLines.push(`    ...proficiencyRequirements(w),`);
    }
    const bab = requirements.find((r) => !("chainingOperator" in r) && r.target === "combat.bab");
    if (bab) reqLines.push(`    ${this.requirement(bab, 2)},`);
    // Then the others: a family's feat for the same weapon (Weapon Specialization requires Weapon Focus in it)
    reqLines.push(
      ...this.itemRequirementLines(
        family,
        requirements.filter((r) => r !== bab),
        "w",
        families,
      ),
    );
    this.emitTemplateRequirements(reqLines);

    this.emitTemplateModifiers(modifiers, (target) => this.weaponTarget(target));
    this.closeTemplate(familyName);
  }

  /** Having the feat `featName`, or its feat for the item (`variable`) when `perItem`: `eq(feat(...))`. */
  private featRequirement(featName: string, perItem: boolean, variable: string): string {
    this.uses.add("eq");
    this.uses.add("feat");
    return perItem ? `eq(feat(\`${escapeTemplate(featName)}: \${${variable}}\`))` : `eq(feat(${quote(featName)}))`;
  }

  /** The slug of the feat a `feats.<slug>.possessed` check names. */
  private featSlug(req: RequirementCondition): string {
    return req.target.replace(/^feats\./, "").replace(/\.possessed$/, "");
  }

  /**
   * A template's `requirements`, for its item (`variable`): a family it requires (`families`) is that family's feat for
   * the item (Greater Spell Focus requires Spell Focus in its school); any other feat, and any other requirement, as it
   * is. A family checked inside a group has no way to name the item: the template is refused.
   */
  private itemRequirementLines(
    { familyName, featNameMap }: TemplateFamily,
    requirements: RequirementEntry[],
    variable: string,
    families: Set<string>,
  ): string[] {
    const namesFamily = (entry: RequirementEntry): boolean =>
      "chainingOperator" in entry
        ? entry.children.some(namesFamily)
        : entry.target.startsWith("feats.") && families.has(featNameMap[this.featSlug(entry)] ?? "");
    const lines: string[] = [];
    for (const req of requirements) {
      if (!("chainingOperator" in req) && req.target.startsWith("feats.")) {
        const featName = featNameMap[this.featSlug(req)];
        if (featName) lines.push(`    ${this.featRequirement(featName, families.has(featName), variable)},`);
      } else if (namesFamily(req)) {
        throw new Error(`${familyName}: a family it requires inside a group can't be written for each item`);
      } else {
        lines.push(`    ${this.requirement(req, 2)},`);
      }
    }
    return lines;
  }

  /** Starts a template: its feats over its options, named and described after each item (`variable`). */
  private openTemplate(
    { constName, familyName, aptitudes, options }: TemplateFamily,
    variable: string,
    description: string,
  ): void {
    this.uses.add(options);
    this.declare("FeatSeed");
    this.lines.push(`export const ${constName}: FeatSeed[] = ${options}.map((${variable}) => ({`);
    this.lines.push(`  name: \`${escapeTemplate(familyName)}: \${${variable}}\`,`);
    this.lines.push(`  description: \`${description}\`,`);
    this.lines.push(`  generated: true,`);
    this.lines.push(`  aptitudes: [${aptitudes.map(quote).join(", ")}],`);
  }

  /** A template's description, each mention of the chosen item made the item (`variable`). */
  private templateDescription({ description, type }: TemplateFamily, variable: string): string {
    const ITEM = "\u0000";
    return expandTemplateDescription(normalizeDescription(description), type, ITEM)
      .split(ITEM)
      .map(escapeTemplate)
      .join(`\${${variable}}`);
  }

  /** A weapon family's modifier target, made the item's: a weapon.X path becomes items.weapons.<weapon>.X. */
  private weaponTarget(target: string) {
    return target.replace(/^weapon\./, "items.weapons.${stripSeparators(w)}.");
  }

  /** The system feats of the core rules' feat file `fileName`. */
  emitSystemFeats(fileName: string): void {
    this.declare("FeatSeed");
    for (const { name, code, uses } of CORE_SYSTEM_FEATS.filter((systemFeats) => systemFeats.file === fileName)) {
      this.lines.push(`/** A system feat list (\`buildCoreSystemFeats\`): no reference lists it. */`);
      this.lines.push(`export const ${name}: FeatSeed[] = ${code};`);
      for (const used of uses) this.uses.add(used);
    }
    this.lines.push("");
  }

  /** Writes a template family's feats, by its type. */
  emitTemplate(family: TemplateFamily, families: Set<string>) {
    const type: TemplateType = family.type;
    switch (type) {
      case "weapon":
        return this.emitWeaponTemplate(family, families);
      case "crossbow":
        return this.emitCrossbowTemplate(family);
      case "skill":
        return this.emitSkillTemplate(family, families);
      case "school":
        return this.emitSchoolTemplate(family, families);
      default:
        return type satisfies never;
    }
  }
}
