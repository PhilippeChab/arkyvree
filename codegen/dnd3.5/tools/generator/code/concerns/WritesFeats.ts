import BookLayout from "@/codegen/dnd3.5/tools/generator/BookLayout.ts";
import type { BaseCodeFile } from "@/codegen/dnd3.5/tools/generator/code/BaseCodeFile.ts";
import { type FeatSeeds, type TemplateFamily, type TemplateType } from "@/codegen/dnd3.5/tools/seeds/FeatSeeds.ts";
import { expandTemplateDescription, normalizeDescription } from "@/codegen/dnd3.5/tools/text/scrapedText.ts";
import type {
  ModifierSeed,
  RequirementCondition,
  RequirementEntry,
} from "@/content/core/builders/customization/types.ts";
import type { FeatSeed } from "@/content/dnd3.5/builders/feats/types.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { FEAT_FAMILY } from "@/vocabulary/dnd3.5/properties/index.ts";

/**
 * Writing a feat, and a template family's feats made per item (weapon, skill, school…). What a template's code uses
 * (weapon lists, skill names…) is imported from where the content defines it (`IMPORT_TABLE`).
 */
export function WritesFeats<B extends Constructor<BaseCodeFile>>(Base: B) {
  abstract class WritingFeats extends Base {
    /** Ends a template: its feats' family. */
    private closeTemplate(familyName: string): void {
      this.lines.push(`  properties: [${this.property({ type: FEAT_FAMILY, value: familyName })}],`);
      this.lines.push(`}));`);
      this.lines.push("");
    }

    /** Having the feat `featName`, or its feat for the item (`variable`) when `perItem`: `eq(feat(...))`. */
    private featRequirement(featName: string, perItem: boolean, variable: string): string {
      this.uses.add("eq");
      this.uses.add("feat");
      return perItem
        ? `eq(feat(\`${this.escapeTemplate(featName)}: \${${variable}}\`))`
        : `eq(feat(${this.quote(featName)}))`;
    }

    /** The slug of the feat a `feats.<slug>.possessed` check names. */
    private featSlug(req: RequirementCondition): string {
      return req.target.replace(/^feats\./, "").replace(/\.possessed$/, "");
    }

    /**
     * A template's `requirements`, for its item (`variable`): a family it requires (`families`) is that family's feat
     * for the item (Greater Spell Focus requires Spell Focus in its school); any other feat, and any other requirement,
     * as it is. A family checked inside a group has no way to name the item: the template is refused.
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
      { familyName, aptitudes, options }: TemplateFamily,
      variable: string,
      description: string,
    ): void {
      this.uses.add(options);
      this.declare("FeatSeed");
      this.lines.push(
        `export const ${BookLayout.templateList(familyName)}: FeatSeed[] = ${options}.map((${variable}) => ({`,
      );
      this.lines.push(`  name: \`${this.escapeTemplate(familyName)}: \${${variable}}\`,`);
      this.lines.push(`  description: \`${description}\`,`);
      this.lines.push(`  generated: true,`);
      this.lines.push(`  aptitudes: [${aptitudes.map((name) => this.quote(name)).join(", ")}],`);
    }

    /** A template's description, each mention of the chosen item made the item (`variable`). */
    private templateDescription({ description, type }: TemplateFamily, variable: string): string {
      const ITEM = "\u0000";
      return expandTemplateDescription(normalizeDescription(description), type, ITEM)
        .split(ITEM)
        .map((text) => this.escapeTemplate(text))
        .join(`\${${variable}}`);
    }

    /** A weapon family's modifier target, made the item's: a weapon.X path becomes items.weapons.<weapon>.X. */
    private weaponTarget(target: string) {
      return target.replace(/^weapon\./, "items.weapons.${stripSeparators(w)}.");
    }

    private writeCrossbowTemplate(family: TemplateFamily): void {
      this.openTemplate(family, "w", this.templateDescription(family, "w"));
      this.writeTemplateModifiers(family.modifiers, (target) => this.weaponTarget(target));
      this.closeTemplate(family.familyName);
    }

    private writeSchoolTemplate(family: TemplateFamily, families: Set<string>): void {
      const { modifiers } = family;
      this.openTemplate(family, "s", this.templateDescription(family, "s"));
      this.writeTemplateRequirements(this.itemRequirementLines(family, family.requirements, "s", families));

      // Use the explicit modifiers from the reference JSON. Re-write any
      // `powers.groups.<placeholder>.` segment to the per-school slug. Other
      // targets (e.g. `skills.spellcraft.misc`) are kept verbatim — schools
      // don't parameterize skill names the way SKILL_NAMES does.
      this.writeTemplateModifiers(modifiers, (target) =>
        target.replace(/powers\.groups\.[^.]+\./, "powers.groups.${stripSeparators(s)}."),
      );
      this.closeTemplate(family.familyName);
    }

    /** A feat per skill: its description and modifiers name the skill (`{skill}`, `skills.skill.…`). */
    private writeSkillTemplate(family: TemplateFamily, families: Set<string>): void {
      this.openTemplate(family, "s", this.templateDescription(family, "s"));
      this.writeTemplateRequirements(this.itemRequirementLines(family, family.requirements, "s", families));
      this.writeTemplateModifiers(family.modifiers, (target) =>
        target.replace(/skills\.[^.]+/, "skills.${stripSeparators(s)}"),
      );
      this.closeTemplate(family.familyName);
    }

    /**
     * A template's modifiers, each target made the item's by `retarget`. A requirement on one throws: its targets would
     * have to be the item's too.
     */
    private writeTemplateModifiers(modifiers: ModifierSeed[], retarget: (target: string) => string): void {
      this.lines.push(
        ...this.listField(
          "modifiers",
          modifiers.map((m) => {
            if (m.requirements?.length)
              throw new Error(`${m.target}: a template feat's modifier can't have requirements`);
            const target = retarget(this.escapeTemplate(m.target));
            if (target.includes("${stripSeparators(")) this.uses.add("stripSeparators");
            return this.modifier(m, 2, `\`${target}\``);
          }),
          "  ",
        ),
      );
    }

    /** A template's requirements, when it has some. */
    private writeTemplateRequirements(reqLines: string[]): void {
      if (reqLines.length === 0) return;
      this.lines.push(`  requirements: [`, ...reqLines, `  ],`);
    }

    private writeWeaponTemplate(family: TemplateFamily, families: Set<string>): void {
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
      this.writeTemplateRequirements(reqLines);

      this.writeTemplateModifiers(modifiers, (target) => this.weaponTarget(target));
      this.closeTemplate(familyName);
    }

    /** A feat written as code, a list's item. */
    feat(feat: FeatSeed): string[] {
      return [
        `  {`,
        `    name: ${this.quote(feat.name)},`,
        `    description: ${this.quote(feat.description)},`,
        ...(feat.stackable ? [`    stackable: true,`] : []),
        ...(feat.selectable === false ? [`    selectable: false,`] : []),
        ...(feat.generated ? [`    generated: true,`] : []),
        `    aptitudes: [${feat.aptitudes.map((name) => this.quote(name)).join(", ")}],`,
        ...this.listField(
          "requirements",
          (feat.requirements ?? []).map((req) => this.requirement(req, 3)),
          "    ",
        ),
        ...this.listField(
          "modifiers",
          (feat.modifiers ?? []).map((m) => this.modifier(m)),
          "    ",
        ),
        ...this.listField(
          "properties",
          (feat.properties ?? []).map((p) => this.property(p)),
          "    ",
        ),
        `  },`,
      ];
    }

    /**
     * A feats file's lists (what a feat reference makes, `FeatSeeds`): a list per feat type, and a template family's
     * feats made per item; `families` the families a feat can require, which name a template's item's feat.
     */
    featsFile(seeds: FeatSeeds, families: Set<string>): void {
      for (const [type, feats] of seeds.byType()) {
        this.list(
          BookLayout.featTypeList(type),
          "FeatSeed",
          feats.flatMap((feat) => this.feat(feat)),
        );
      }
      for (const family of seeds.templates()) this.featTemplate(family, families);
    }

    /**
     * A template family's feats written as code, a list made over its options (weapons, skills, schools…), each feat
     * named and described after its item; `families` the families a feat can require, which name the item's feat.
     */
    featTemplate(family: TemplateFamily, families: Set<string>) {
      const type: TemplateType = family.type;
      switch (type) {
        case "weapon":
          return this.writeWeaponTemplate(family, families);
        case "crossbow":
          return this.writeCrossbowTemplate(family);
        case "skill":
          return this.writeSkillTemplate(family, families);
        case "school":
          return this.writeSchoolTemplate(family, families);
        default:
          return type satisfies never;
      }
    }
  }
  return WritingFeats;
}
