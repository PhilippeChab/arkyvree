import type { BaseRequirementReading } from "@/codegen/dnd3.5/tools/detect/readers/requirements/BaseRequirementReading.ts";
import { SKILL_SLUGS, toSkillSlug } from "@/codegen/dnd3.5/tools/terms/skills.ts";
import { gte, or } from "@/content/core/builders/customization/requirements.ts";
import type { RequirementEntry } from "@/content/core/builders/customization/types.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { capitalize, stripSeparators } from "@/shared/text.ts";
import { CHECKLESS_SKILLS, SKILL_NAMES } from "@/vocabulary/dnd3.5/skills.ts";

/** The skills no check is made with, lowercased: a prerequisite's ranks in one (Speak Language's languages) aren't read. */
const CHECKLESS_SKILL_NAMES = new Set(CHECKLESS_SKILLS.map((name) => name.toLowerCase()));

/** A Craft skill's subtypes as a prerequisite abbreviates them: "leather" is Leatherworking. */
const CRAFT_SUBTYPES: Record<string, string> = {
  basket: "basketweaving",
  bone: "bonecarving",
  cloth: "weaving",
  gem: "gemcutting",
  leather: "leatherworking",
  metal: "metalworking",
  pottery: "pottery",
  stone: "stoneworking",
  wood: "woodworking",
};

/** Reading what a prerequisite asks of a skill: ranks in it, in any of a family's ("Knowledge (any)"), or in one of several. */
export function ReadsSkills<B extends Constructor<BaseRequirementReading>>(Base: B) {
  abstract class ReadingSkills extends Base {
    /** A skill's option's slug: "Knowledge (local)", "Craft (leather)" (Leatherworking). */
    private optionSlug(baseName: string, option: string): string {
      const subtype = /^craft$/i.test(baseName) ? (CRAFT_SUBTYPES[option.toLowerCase()] ?? option) : option;
      const fullName = `${baseName} (${capitalize(subtype)})`;
      return SKILL_SLUGS[fullName.toLowerCase()] ?? stripSeparators(fullName);
    }

    /**
     * `ranks` in any skill "X (any)" names ("Knowledge (any)": any Knowledge skill), or none when it names no skill.
     */
    protected anySkillRequirement(name: string, ranks: number): RequirementEntry | undefined {
      if (!/\(any\)/i.test(name)) return undefined;
      const baseName = name
        .replace(/\s*\(any\)/i, "")
        .trim()
        .toLowerCase();
      const checks = SKILL_NAMES.filter((s) => s.toLowerCase().startsWith(baseName)).map((s) =>
        gte(`skills.${stripSeparators(s)}.rank`, ranks),
      );
      if (checks.length <= 1) return checks[0];
      return or(...checks);
    }

    /**
     * `ranks` in the skill `name` names: in any of a family's ("Knowledge (any)"), in any of the options it lists
     * ("Knowledge (arcana, local or psionics)", "Craft (leather or metal)") or of the skills ("Diplomacy or Intimidate"),
     * else in it, or its base skill for a specialization the skill list doesn't name ("Perform (dance)"). None for a skill
     * no check is made with ("Speak Language (Terran)").
     */
    protected skillRankRequirement(name: string, ranks: number): RequirementEntry | undefined {
      const baseName = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
      if (CHECKLESS_SKILL_NAMES.has(baseName.toLowerCase())) return undefined;
      const anySkill = this.anySkillRequirement(name, ranks);
      if (anySkill) return anySkill;

      const options = (/\(([^)]*(?:,|\bor\b)[^)]*)\)\s*$/i.exec(name)?.[1] ?? "")
        .split(/,\s*(?:or\s+)?|\s+or\s+/)
        .map((option) => option.trim())
        .filter(Boolean);
      const slugs =
        options.length >= 2
          ? options.map((option) => this.optionSlug(baseName, option))
          : name.split(/\s+or\s+/i).map((skill) => toSkillSlug(skill.trim()));
      const checks = slugs.map((slug) => gte(`skills.${slug}.rank`, ranks));
      return checks.length === 1 ? checks[0] : or(...checks);
    }
  }
  return ReadingSkills;
}
