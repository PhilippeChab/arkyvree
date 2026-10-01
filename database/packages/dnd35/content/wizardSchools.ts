import { gte } from "@/database/packages/dnd35/content/requirements.ts";
import type { FeatSeed, WizardSchoolDefinition } from "@/database/packages/dnd35/content/types.ts";
import { WIZARD_PROHIBITED_SCHOOL } from "@/server/rulesets/dnd3.5/properties/index.ts";

const SPECIALIZATION = "Wizard Specialization";
const PROHIBITED_SCHOOL = "Prohibited School";

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
      modifiers: [
        {
          target: "aptitudes.prohibitedschool.allowed",
          operator: "add",
          value: String(s.prohibitedSchoolCount),
          valueType: "number",
        },
      ],
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
