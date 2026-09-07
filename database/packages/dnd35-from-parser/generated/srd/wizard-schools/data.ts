import type { WizardSchoolDefinition } from "@/database/packages/dnd35/v1/wizard-schools/types.ts";

export const WIZARD_PROHIBITED_SCHOOL = "WIZARD_PROHIBITED_SCHOOL";

export const WIZARD_SCHOOLS: WizardSchoolDefinition[] = [
  {
    name: "Abjuration",
    description: "Choosing abjuration as a specialty grants the wizard heightened skill with defensive and warding magic. Beyond the usual advantages of specialization, the abjurer receives no extra class features.",
    prohibitedSchoolCount: 2,
  },
  {
    name: "Conjuration",
    description: "By focusing on conjuration, a wizard gains exceptional proficiency with spells that summon creatures, produce objects, and move things across distances. Apart from the standard specialization bonuses, the conjurer does not gain any further class features.",
    prohibitedSchoolCount: 2,
  },
  {
    name: "Divination",
    description: "Specializing in divination gives the wizard superior command over magic that uncovers hidden knowledge and gathers information. Unlike other specialists, a diviner only needs to sacrifice one prohibited school instead of two.",
    prohibitedSchoolCount: 1,
  },
  {
    name: "Enchantment",
    description: "When a wizard takes enchantment as a specialty, they develop particular expertise in magic that influences the thoughts and behavior of other creatures. The enchanter gains the normal specialization benefits but no additional class features beyond those.",
    prohibitedSchoolCount: 2,
  },
  {
    name: "Evocation",
    description: "Focusing on evocation sharpens a wizard's ability to channel raw energy and produce dramatic magical effects. Outside of the standard benefits granted by specialization, the evoker does not receive any extra class features.",
    prohibitedSchoolCount: 2,
  },
  {
    name: "Illusion",
    description: "A wizard who dedicates study to illusion becomes remarkably skilled at weaving false sensory impressions and phantasmal manifestations. No class features are gained beyond the normal advantages of being a specialist.",
    prohibitedSchoolCount: 2,
  },
  {
    name: "Necromancy",
    description: "Specialization in necromancy provides the wizard with enhanced mastery over forces related to death, undeath, and life force manipulation. The necromancer benefits from the standard specialist advantages but gains no further class features.",
    prohibitedSchoolCount: 2,
  },
  {
    name: "Transmutation",
    description: "Taking transmutation as a specialty makes the wizard particularly adept at magic that alters the physical form and characteristics of creatures and objects. Aside from the standard specialist benefits, the transmuter receives no additional class features.",
    prohibitedSchoolCount: 2,
  },
];
