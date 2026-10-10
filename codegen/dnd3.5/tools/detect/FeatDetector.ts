import { sanitizeJsonValues } from "@/codegen/dnd3.5/tools/text/sanitize.ts";
import type { ClassReferenceFile } from "@/codegen/dnd3.5/tools/types/classes.ts";
import type { FeatReference } from "@/codegen/dnd3.5/tools/types/feats.ts";
import { and, gte, or } from "@/content/core/builders/customization/requirements.ts";
import { stripSeparators } from "@/shared/text.ts";
import { FEAT_FAMILIES } from "@/vocabulary/dnd3.5/feats.ts";
import { FEAT_FAMILY } from "@/vocabulary/dnd3.5/properties/index.ts";

import { BaseDetector } from "./BaseDetector.ts";
import { BenefitModifiers } from "./readers/modifiers/BenefitModifiers.ts";
import { FeatPrerequisites } from "./readers/requirements/FeatPrerequisites.ts";

/** Complete Arcane's draconic feats have no type of their own: their name makes them a family. */
const DRACONIC_FAMILY = "Draconic";

/** The aptitudes a feat's type makes it a pick of. */
const FEAT_TYPE_APTITUDES: Record<string, string[]> = {
  general: ["General"],
  fighter: ["General", "Fighter Bonus Feat"],
  metamagic: ["General", "Wizard Bonus Feat"],
  "item creation": ["General", "Wizard Bonus Feat"],
};

function detectTemplate(entry: FeatReference["raw"][number]): FeatReference["detected"][string]["template"] {
  const text = (entry.benefit + " " + (entry.special ?? "")).toLowerCase();

  // Weapon templates: "selected weapon", "using the weapon you selected"
  if (/selected weapon|the weapon you selected|type of weapon/.test(text))
    return { type: "weapon", familyName: entry.name };

  // Crossbow-specific: "chosen type of crossbow"
  if (/type of crossbow|chosen.*crossbow/.test(text)) return { type: "crossbow", familyName: entry.name };

  // Skill templates: a feat taken again for another skill, not one about any skill ("as if you had 1/2 rank in that
  // skill": Jack of All Trades)
  if (/the skill you select|applies to a new skill/.test(text)) return { type: "skill", familyName: entry.name };

  // School templates: a feat taken again for another school, not one naming a school ("a school of magic you have
  // access to": Precocious Apprentice)
  if (/school of magic you select|chosen school|selected school|applies to a new school/.test(text))
    return { type: "school", familyName: entry.name };

  // "Each time you take the feat, it applies to a new type of exotic weapon"
  if (/new type of.*weapon/.test(text)) return { type: "weapon", familyName: entry.name };

  return undefined;
}

function isStackable(entry: FeatReference["raw"][number]): boolean {
  const special = (entry.special ?? "").toLowerCase();
  if (/do not stack|don't stack|effects are not cumulative/i.test(special)) return false;
  return (
    /(?:can|may) (?:gain|take).*multiple times/i.test(special) ||
    /select this feat multiple times/i.test(special) ||
    special.includes("its effects stack")
  );
}

/**
 * A feat reference's detector: what each feat's text gives (`detected`: its aptitudes, prerequisites, modifiers,
 * family, template), read from its page sanitized, and the feats it makes (`mapping`): those, its overrides applied,
 * and what its book's classes give them (the aptitudes and class levels of the bonus feat lists that name them).
 */
export class FeatDetector extends BaseDetector<FeatReference> {
  constructor(stored: Pick<FeatReference, "_meta" | "overrides" | "raw">, classes: ClassReferenceFile[]) {
    super(stored);
    this.classes = classes;
    this.feats = sanitizeJsonValues(stored.raw);
  }

  /** The book's classes, whose bonus feat lists name its feats. */
  private readonly classes: ClassReferenceFile[];
  /** The feats its page gives, sanitized. */
  private readonly feats: FeatReference["raw"];

  /**
   * Each feat's aptitudes from the book's classes: the bonus feat lists that name it, and the class feature aptitude of
   * a class whose feature says it "gains X as a bonus feat".
   */
  private bonusFeatAptitudes(): Map<string, string[]> {
    const map = new Map<string, string[]>();

    function add(featName: string, aptitude: string) {
      const existing = map.get(featName) ?? [];
      if (!existing.includes(aptitude)) {
        existing.push(aptitude);
        map.set(featName, existing);
      }
    }

    for (const { ref } of this.classes) {
      // Bonus feat lists → aptitudes
      for (const list of ref.mapping.bonusFeatLists ?? [])
        for (const featName of list.feats) add(featName, list.aptitude);

      // "gains X as a bonus feat" in class feature descriptions → class feature aptitude
      const aptitude = ref.mapping?.classFeatureAptitude;
      if (!aptitude) continue;
      const grantRegex = /gains (?:the )?([A-Z][^.]*?) (?:feat [^.]*)?as a bonus feat/g;
      for (const cf of ref.raw.classFeatures) {
        let match: RegExpExecArray | null;
        while ((match = grantRegex.exec(cf.description)) !== null) {
          const name = match[1].replace(/\s*\([^)]*\)\s*$/, "").trim();
          add(name, aptitude);
        }
      }
    }
    return map;
  }

  /**
   * Each feat's class levels that grant it as a bonus feat (for alternate prerequisites), from the book's classes'
   * lists.
   */
  private bonusFeatClassLevels(): Map<string, { classSlug: string; minLevel: number }[]> {
    const map = new Map<string, { classSlug: string; minLevel: number }[]>();

    for (const { ref } of this.classes) {
      const lists = ref.mapping.bonusFeatLists;
      if (!lists) continue;
      // The class's path segment (`classes.wujen.level`), as every class path names it: its name's, not its file's
      const classSlug = stripSeparators(ref.raw.name);
      for (const list of lists) {
        if (!list.levels?.length) continue;
        const minLevel = Math.min(...list.levels);
        for (const featName of list.feats) {
          const existing = map.get(featName) ?? [];
          existing.push({ classSlug, minLevel });
          map.set(featName, existing);
        }
      }
    }
    return map;
  }

  /** Each feat's detected section. */
  protected detected(): FeatReference["detected"] {
    const detected: FeatReference["detected"] = {};

    for (const entry of this.feats) {
      const prerequisites = new FeatPrerequisites(entry);
      const aptitudes = [...(FEAT_TYPE_APTITUDES[entry.featType] ?? ["General"])];

      // Detect fighter bonus feat from Special text: "A fighter may select", or "can select" (Complete Scoundrel)
      if (
        entry.special &&
        /fighter (?:may|can) select/i.test(entry.special) &&
        !aptitudes.includes("Fighter Bonus Feat")
      )
        aptitudes.push("Fighter Bonus Feat");

      const benefit = new BenefitModifiers(entry.benefit);
      const errors = [...benefit.errors, ...prerequisites.errors];

      const template = detectTemplate(entry);

      const family =
        FEAT_FAMILIES.find((name) => name.toLowerCase() === entry.featType) ??
        (entry.name.startsWith(`${DRACONIC_FAMILY} `) ? DRACONIC_FAMILY : undefined);
      const properties = family ? [{ type: FEAT_FAMILY, value: family }] : [];

      detected[entry.name] = {
        aptitudes,
        requirements: prerequisites.requirements,
        modifiers: benefit.modifiers,
        ...(properties.length > 0 ? { properties } : {}),
        ...(errors.length > 0 ? { errors } : {}),
        ...(!template && benefit.unresolved.length > 0 ? { unresolvedModifiers: benefit.unresolved } : {}),
        ...(!template && prerequisites.unresolved.length > 0 ? { unresolvedPrereqs: prerequisites.unresolved } : {}),
        featNameMap: prerequisites.featNames,
        ...(isStackable(entry) ? { stackable: true } : {}),
        ...(template ? { template } : {}),
      };
    }

    return detected;
  }

  /**
   * Each feat's mapping: what was detected, its overrides merged in, and what its book's classes give it (the
   * aptitudes and class levels of the bonus feat lists that name it).
   */
  protected mapping(detected: FeatReference["detected"]): FeatReference["mapping"] {
    const overrides = this.stored.overrides ?? {};
    const bonusFeatAptitudes = this.bonusFeatAptitudes();
    const bonusFeatClassLevels = this.bonusFeatClassLevels();
    const mapping: FeatReference["mapping"] = {};
    for (const entry of this.feats) {
      const det = detected[entry.name];
      const ovr = overrides[entry.name];
      if (!det) continue;

      const featNameMap = { ...det.featNameMap, ...ovr?.featNameMap };
      const baseAptitudes = ovr?.aptitudes ?? det.aptitudes;
      const extraAptitudes = (bonusFeatAptitudes.get(entry.name) ?? []).filter((a) => !baseAptitudes.includes(a));

      // Wrap detected requirements with class-level alternatives from bonusFeatLists
      let requirements = ovr?.requirements ?? det.requirements;
      if (!ovr?.requirements && requirements.length > 0) {
        const classLevels = bonusFeatClassLevels.get(entry.name);
        if (classLevels?.length) {
          const detectedBranch = requirements.length === 1 ? requirements[0] : and(...requirements);
          const classAlts = classLevels.map((cl) => gte(`classes.${cl.classSlug}.level`, cl.minLevel));
          requirements = [or(detectedBranch, ...classAlts)];
        }
      }

      mapping[entry.name] = {
        description: ovr?.description ?? entry.benefit,
        aptitudes: [...baseAptitudes, ...extraAptitudes],
        requirements,
        modifiers: ovr?.modifiers ?? det.modifiers ?? [],
        ...((ovr?.properties ?? det.properties)?.length ? { properties: ovr?.properties ?? det.properties } : {}),
        ...((ovr?.stackable ?? det.stackable) ? { stackable: true } : {}),
        ...(ovr?.selectable === false ? { selectable: false } : {}),
        ...(det.template ? { template: det.template } : {}),
        ...(Object.keys(featNameMap).length > 0 ? { featNameMap } : {}),
        // An epic feat is left out unless an override keeps it
        ...(ovr?.skip || (entry.featType === "epic" && ovr?.skip !== false) ? { skip: true } : {}),
      };
    }
    return mapping;
  }
}
