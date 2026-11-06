import type { BaseCodeFile } from "@/codegen/pf1/tools/generator/code/BaseCodeFile.ts";
import type { FeatFamily } from "@/codegen/pf1/tools/seeds/FeatSeeds.ts";
import { FAMILY_OPTIONS, OPTION, type OptionKind } from "@/codegen/pf1/tools/terms/featOptions.ts";
import type { ModifierSeed, RequirementEntry } from "@/content/core/builders/customization/types.ts";
import type { FeatSeed } from "@/content/pf1/builders/feats/types.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { FEAT_FAMILY, FEAT_GENERATED } from "@/vocabulary/pf1/fields/index.ts";

/** The list a feat of none of `TYPE_LISTS`' families is written in. */
const GENERAL_LIST = "GENERAL_FEATS";

/** The variable a family's generated code names its option by, by the option's kind. */
const OPTION_VARIABLES: Record<OptionKind, string> = { element: "e", school: "s", skill: "s", weapon: "w" };

/** The list a feat of no family taken per option is written in, by the first of its types' families it has. */
const TYPE_LISTS: [family: string, list: string][] = [
  ["Item Creation", "ITEM_CREATION_FEATS"],
  ["Metamagic", "METAMAGIC_FEATS"],
  ["Combat", "COMBAT_FEATS"],
];

/**
 * Writing a feat, and a family's feats made per option (weapon, skill, school, element) over the list its options are
 * (`FamilyOptions.list`), which the generated code imports from where the content defines it, or writes out.
 */
export function WritesFeats<B extends Constructor<BaseCodeFile>>(Base: B) {
  abstract class WritingFeats extends Base {
    /** The list a family's feats are written in: "Weapon Focus" → WEAPON_FOCUS_FEATS. */
    private familyList(family: string): string {
      return `${family.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_FEATS`;
    }

    /** `code` with each string naming the option (`OPTION`) made a template naming it by its slug (`variable`'s). */
    private optionCode(code: string, variable: string): string {
      if (!code.includes(OPTION)) return code;
      const placeholder = new RegExp(String.raw`"([^"]*)${OPTION.replace(/[{}]/g, "\\$&")}([^"]*)"`, "g");
      this.uses.add("stripSeparators");
      return code.replace(
        placeholder,
        (_, before: string, after: string) => `\`${before}\${stripSeparators(${variable})}${after}\``,
      );
    }

    /** A family's description, as a template's text: each mention of the option (`OPTION`) the option (`variable`). */
    private optionDescription(description: string, variable: string): string {
      return description
        .split(OPTION)
        .map((text) => this.escapeTemplate(text))
        .join(`\${${variable}}`);
    }

    /** A family's modifiers for its option (`variable`), their paths and their requirements' naming it. */
    private optionModifierLines(modifiers: ModifierSeed[], variable: string): string[] {
      return this.listField(
        "modifiers",
        modifiers.map((modifier) => this.optionCode(this.modifier(modifier, 2), variable)),
        "  ",
      );
    }

    /**
     * A family's requirements for its option (`variable`): proficiency with its weapon when it asks it, then each of
     * its own, a feat of a family taken per option the family's feat for the same option (Weapon Specialization's
     * Weapon Focus). A family checked inside a group has no way to name the option: the family is refused.
     */
    private optionRequirementLines({ family, featNames, proficient, requirements }: FeatFamily, variable: string) {
      const namesFamily = (entry: RequirementEntry): boolean =>
        "chainingOperator" in entry
          ? entry.children.some(namesFamily)
          : FAMILY_OPTIONS[featNames[/^feats\.([^.]+)\.possessed$/.exec(entry.target)?.[1] ?? ""] ?? ""] !== undefined;
      const lines: string[] = [];
      if (proficient) {
        this.uses.add("proficiencyRequirements");
        lines.push(`    ...proficiencyRequirements(${variable}),`);
      }
      for (const requirement of requirements) {
        const slug = "target" in requirement ? /^feats\.([^.]+)\.possessed$/.exec(requirement.target)?.[1] : undefined;
        const featName = slug && featNames[slug];
        if (featName && FAMILY_OPTIONS[featName]) {
          this.uses.add("eq");
          this.uses.add("feat");
          lines.push(`    eq(feat(\`${this.escapeTemplate(featName)}: \${${variable}}\`)),`);
        } else if (namesFamily(requirement)) {
          throw new Error(`${family}: a family it requires inside a group can't be written for each option`);
        } else {
          lines.push(`    ${this.optionCode(this.requirement(requirement, 2), variable)},`);
        }
      }
      return lines;
    }

    /** A feat written as code, a list's item. */
    feat(feat: FeatSeed): string[] {
      return [
        `  {`,
        `    name: ${this.quote(feat.name)},`,
        `    description: ${this.quote(feat.description)},`,
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
        ...(feat.fields ? [`    fields: ${this.seedFields(feat.fields)},`] : []),
        `  },`,
      ];
    }

    /**
     * A family's feats written as code, a list of its name made over its options (`FamilyOptions.list`), each feat
     * named `<family>: <option>` and described, checked and modified for its option, of its family and its types', and
     * generated (`FEAT_GENERATED`); `aptitudes` those of its seed, a class's bonus feats' among them. Its list's name.
     */
    featFamily(family: FeatFamily, aptitudes: string[]): string {
      const { list, inline, kind } = family.options;
      const variable = OPTION_VARIABLES[kind];
      const name = this.familyList(family.family);
      if (!inline) this.uses.add(list);
      this.declare("FeatSeed");
      const requirementLines = this.optionRequirementLines(family, variable);
      this.lines.push(
        `export const ${name}: FeatSeed[] = ${list}.map((${variable}) => ({`,
        `  name: \`${this.escapeTemplate(family.family)}: \${${variable}}\`,`,
        `  description: \`${this.optionDescription(family.description, variable)}\`,`,
        `  aptitudes: [${aptitudes.map((aptitude) => this.quote(aptitude)).join(", ")}],`,
        ...(requirementLines.length > 0 ? [`  requirements: [`, ...requirementLines, `  ],`] : []),
        ...this.optionModifierLines(family.modifiers, variable),
        `  fields: ${this.seedFields({ [FEAT_GENERATED]: true, [FEAT_FAMILY]: [family.family, ...(family.fields[FEAT_FAMILY] ?? [])] })},`,
        `}));`,
        ``,
      );
      return name;
    }

    /**
     * A book's feats file (`BookLayout.featsFile`): its feats, a list per type (`TYPE_LISTS`), and a list per family
     * taken per option, a feat `familyOf` gives one of leading it. The lists it exports, which it returns.
     */
    featsFile(feats: FeatSeed[], familyOf: (name: string) => FeatFamily | undefined): string[] {
      const byList = new Map<string, FeatSeed[]>();
      const families: string[] = [];
      for (const feat of feats) {
        const family = familyOf(feat.name);
        if (family) {
          families.push(this.featFamily(family, feat.aptitudes));
          continue;
        }
        const featFamilies: readonly string[] = feat.fields?.[FEAT_FAMILY] ?? [];
        const list = TYPE_LISTS.find(([type]) => featFamilies.includes(type))?.[1] ?? GENERAL_LIST;
        byList.set(list, [...(byList.get(list) ?? []), feat]);
      }
      for (const [list, listed] of byList) {
        this.list(
          list,
          "FeatSeed",
          listed.flatMap((feat) => this.feat(feat)),
        );
      }
      return [...byList.keys(), ...families];
    }
  }
  return WritingFeats;
}
