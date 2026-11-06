/**
 * The Core Rulebook's arcane schools: the eight a wizard can specialize in, each giving up two others as its opposition
 * schools, and the universalist's, which gives up none. Their descriptions are the app's own summaries.
 */

import type { WizardSchoolSeed } from "@/content/pf1/builders/wizardSchools/types.ts";

/** What every specialist gains of its school: its extra spell slots, and the two schools it opposes. */
const SPECIALIST =
  "A specialist gains an extra spell slot of each spell level he can cast, from the 1st on up, which he fills with a spell of his school, and picks two other schools as his opposition schools: preparing a spell of one of them takes two of his slots.";

export const WIZARD_SCHOOLS: WizardSchoolSeed[] = [
  {
    name: "Abjuration",
    description: `The abjurer specializes in protective magic: wards, resistances and the dispelling of others' spells. ${SPECIALIST}`,
    prohibitedSchoolCount: 2,
  },
  {
    name: "Conjuration",
    description: `The conjurer specializes in calling creatures and making things appear or move across distances. ${SPECIALIST}`,
    prohibitedSchoolCount: 2,
  },
  {
    name: "Divination",
    description: `The diviner specializes in magic that reveals what is hidden, foresees danger and gathers knowledge. ${SPECIALIST}`,
    prohibitedSchoolCount: 2,
  },
  {
    name: "Enchantment",
    description: `The enchanter specializes in magic that sways the minds and the actions of other creatures. ${SPECIALIST}`,
    prohibitedSchoolCount: 2,
  },
  {
    name: "Evocation",
    description: `The evoker specializes in magic that shapes raw energy into fire, lightning, force and the like. ${SPECIALIST}`,
    prohibitedSchoolCount: 2,
  },
  {
    name: "Illusion",
    description: `The illusionist specializes in magic that deceives the senses and the mind. ${SPECIALIST}`,
    prohibitedSchoolCount: 2,
  },
  {
    name: "Necromancy",
    description: `The necromancer specializes in magic of life, death and undeath. ${SPECIALIST}`,
    prohibitedSchoolCount: 2,
  },
  {
    name: "Transmutation",
    description: `The transmuter specializes in magic that changes the properties of creatures and things. ${SPECIALIST}`,
    prohibitedSchoolCount: 2,
  },
  {
    name: "Universalist",
    description:
      "The universalist specializes in no school: he has no opposition schools and no extra spell slots, and casts the spells of every school alike.",
    prohibitedSchoolCount: 0,
  },
];
