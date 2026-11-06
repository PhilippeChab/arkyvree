import { bonus } from "@/content/core/builders/customization/modifiers.ts";
import { gte } from "@/content/core/builders/customization/requirements.ts";
import type { FeatSeed } from "@/content/pf1/builders/feats/types.ts";
import type { WizardSchoolSeed } from "@/content/pf1/builders/wizardSchools/types.ts";
import { WIZARD_PROHIBITED_SCHOOL } from "@/vocabulary/pf1/fields/index.ts";

/** The pool a wizard picks his arcane school in, at 1st level. */
const ARCANE_SCHOOL = "Arcane School";
/** The pool a specialist picks his opposition schools in, as many as his school names. */
const OPPOSITION_SCHOOL = "Opposition School";

/**
 * A wizard's arcane school: a specialist feat per school a wizard can specialize in, which allows as many opposition
 * schools as it names, or the universalist's, a school that names none (`prohibitedSchoolCount` 0); then a feat per
 * school to oppose, which names its school (`WIZARD_PROHIBITED_SCHOOL`).
 */
export function buildWizardSchoolFeats(schools: WizardSchoolSeed[]): FeatSeed[] {
  const requirements = () => [gte("classes.wizard.level", 1)];
  const specialties = schools.filter((s) => s.prohibitedSchoolCount > 0);
  return [
    ...specialties.map((s) => ({
      name: `${s.name} Specialist`,
      description: s.description,
      aptitudes: [ARCANE_SCHOOL],
      requirements: requirements(),
      modifiers: [bonus("aptitudes.oppositionschool.allowed", s.prohibitedSchoolCount)],
    })),
    ...schools
      .filter((s) => s.prohibitedSchoolCount === 0)
      .map((s) => ({
        name: s.name,
        description: s.description,
        aptitudes: [ARCANE_SCHOOL],
        requirements: requirements(),
      })),
    ...specialties.map((s) => ({
      name: `Opposition School: ${s.name}`,
      description: `${s.name} is one of your opposition schools: preparing one of its spells takes two of your spell slots of its level, and you take a -4 penalty on checks to craft a magic item that requires one of its spells.`,
      aptitudes: [OPPOSITION_SCHOOL],
      requirements: requirements(),
      fields: { [WIZARD_PROHIBITED_SCHOOL]: [s.name] },
    })),
  ];
}
