import type { ModifierSeed, RequirementEntry } from "@/content/core/builders/customization/types.ts";
import type { StoredFieldValues } from "@/shared/customization/fields.ts";
import type { ENTITY_FIELDS } from "@/vocabulary/dnd5.2/fields/index.ts";

/**
 * A class as its seed gives it: its name, description and fields (its hit die, how its levels count toward a
 * multiclass's spell slots), its links by name (its
 * spellcasting ability, and the feats its starting proficiencies are, a first class's and a multiclass's), the skills
 * its skill picks are among (`classSkills`: its skills' pool, `classSkills(name)`, lists each one's Skill Proficiency),
 * its features granted at their levels (`features`, each through the class's feature pool, `featurePool`), its levels'
 * modifiers (the pools they give room in: its subclass, its Ability Score Improvements, its Epic Boon, its Fighting
 * Style, Weapon Mastery and Expertise picks; its spell slots, or a warlock's Pact Magic), the requirements a multiclass meets (`requirements`, on its first level:
 * 13 in its primary abilities), and its spells (`spells`: its list, and the cantrips and prepared spells it has by each
 * of its levels, a count per spell level from the cantrips' 0, a level's new ones at the highest level it casts then).
 */
export interface ClassSeed {
  classSkills: string[];
  description: string;
  featurePool: string;
  features: [number, string][];
  fields: ClassFields;
  links?: { multiclassProficiencies?: string; spellcastingAbility?: string; startingProficiencies?: string };
  modifiers?: (ModifierSeed & { level: number })[];
  name: string;
  partition?: string;
  requirements?: RequirementEntry[];
  spells?: { known: number[][]; list: string };
}

export type ClassFields = StoredFieldValues<typeof ENTITY_FIELDS.classes>;
