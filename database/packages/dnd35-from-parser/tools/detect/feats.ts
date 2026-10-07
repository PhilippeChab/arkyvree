import type { ClassReferenceFile } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import type { FeatReference } from "@/database/packages/dnd35-from-parser/tools/types/feats.ts";
import { and, gte, or } from "@/database/packages/dnd35/content/customization/requirements.ts";
import { FEAT_FAMILIES } from "@/shared/dnd3.5/feats.ts";
import { FEAT_FAMILY } from "@/shared/dnd3.5/properties/index.ts";

import { getBonusFeatAptitudes, getBonusFeatClassLevels } from "./bonusFeats.ts";
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

export function buildFeatDetected(raw: FeatReference["raw"]): FeatReference["detected"] {
  const detected: FeatReference["detected"] = {};

  for (const entry of raw) {
    const prerequisites = new FeatPrerequisites(entry);
    const aptitudes = [...(FEAT_TYPE_APTITUDES[entry.featType] ?? ["General"])];

    // Detect fighter bonus feat from Special text: "A fighter may select", or "can select" (Complete Scoundrel)
    if (entry.special && /fighter (?:may|can) select/i.test(entry.special) && !aptitudes.includes("Fighter Bonus Feat"))
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
 * A feat reference's mapping: what was detected, with its overrides merged in, and what its book's `classes` give its
 * feats (the aptitudes and class levels of the bonus feat lists that name them).
 */
export function buildFeatMapping(
  raw: FeatReference["raw"],
  detected: FeatReference["detected"],
  overrides: NonNullable<FeatReference["overrides"]>,
  classes: ClassReferenceFile[],
): FeatReference["mapping"] {
  const bonusFeatAptitudes = getBonusFeatAptitudes(classes);
  const bonusFeatClassLevels = getBonusFeatClassLevels(classes);
  const mapping: FeatReference["mapping"] = {};
  for (const entry of raw) {
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
      ...(ovr?.skip ? { skip: true } : {}),
    };
  }
  return mapping;
}
