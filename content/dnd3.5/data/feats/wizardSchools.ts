import { bonus } from "@/content/core/builders/customization/modifiers.ts";
import { gte } from "@/content/core/builders/customization/requirements.ts";
import type { FeatSeed } from "@/content/dnd3.5/builders/feats/types.ts";
import type { WizardSchoolSeed } from "@/content/dnd3.5/builders/wizardSchools/types.ts";
import { WIZARD_PROHIBITED_SCHOOL } from "@/vocabulary/dnd3.5/properties/index.ts";

const PROHIBITED_SCHOOL = "Prohibited School";
const SPECIALIZATION = "Wizard Specialization";

/**
 * A wizard's choice of school: a specialist feat per school, which allows as many prohibited schools as it names, or
 * the generalist's; then a feat per school to prohibit.
 */
export function buildWizardSchoolFeats(schools: WizardSchoolSeed[]): FeatSeed[] {
  const requirements = () => [gte("classes.wizard.level", 1)];
  return [
    ...schools.map((s) => ({
      name: `${s.name} Specialist`,
      description: s.description,
      aptitudes: [SPECIALIZATION],
      requirements: requirements(),
      modifiers: [bonus("aptitudes.prohibitedschool.allowed", s.prohibitedSchoolCount)],
    })),
    {
      name: "Generalist",
      description:
        "A generalist wizard does not specialize in any school of magic. They have no prohibited schools and gain no bonus spell slots, but can freely learn spells from all schools.",
      aptitudes: [SPECIALIZATION],
      requirements: requirements(),
    },
    ...schools.map((s) => ({
      name: `Prohibit ${s.name}`,
      description: `You cannot learn, prepare, or cast spells from the school of ${s.name}. All spells from this school are removed from your spell list.`,
      aptitudes: [PROHIBITED_SCHOOL],
      requirements: requirements(),
      properties: [{ type: WIZARD_PROHIBITED_SCHOOL, value: s.name }],
    })),
  ];
}
