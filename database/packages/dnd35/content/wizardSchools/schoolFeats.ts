import { bonus } from "@/database/packages/dnd35/content/customization/modifiers.ts";
import { gte } from "@/database/packages/dnd35/content/customization/requirements.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";
import type { WizardSchoolDefinition } from "@/database/packages/dnd35/content/wizardSchools/types.ts";
import { WIZARD_PROHIBITED_SCHOOL } from "@/shared/dnd3.5/properties/index.ts";

const PROHIBITED_SCHOOL = "Prohibited School";
const SPECIALIZATION = "Wizard Specialization";

/**
 * A wizard's choice of school: a specialist feat per school, which allows as many prohibited schools as it names, or
 * the generalist's; then a feat per school to prohibit.
 */
export function wizardSchoolFeats(schools: WizardSchoolDefinition[]): FeatSeed[] {
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
