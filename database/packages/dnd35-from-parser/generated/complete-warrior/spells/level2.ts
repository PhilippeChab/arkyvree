import type { PowerSeed } from "@/database/packages/dnd35/content/spells/types.ts";

export const LEVEL_2_SPELLS: PowerSeed[] = [
  {
    name: "Cloak of Bravery",
    description:
      "You and every ally within the emanation receive a morale bonus on saving throws against fear effects. This bonus equals your caster level, up to a maximum of +10 at caster level 10th.",
    aptitudes: [
      "Cleric Spells",
      "Favored Soul Spells",
      "Holy Liberator Spells",
      "Paladin Spells",
      "Pious Templar Spells",
      "Shugenja Spells",
      "Ur-priest Spells",
    ],
    aptitudeLevels: {
      "Cleric Spells": 3,
      "Favored Soul Spells": 3,
      "Holy Liberator Spells": 2,
      "Paladin Spells": 2,
      "Pious Templar Spells": 2,
      "Shugenja Spells": 3,
      "Ur-priest Spells": 3,
    },
    savingThrow: "Will negates (harmless)",
    properties: [
      { type: "SPELL_SCHOOL", value: "Abjuration" },
      { type: "SPELL_DESCRIPTOR", value: "Mind-Affecting" },
      { type: "SPELL_CASTING_TIME", value: "1 action" },
      { type: "SPELL_RANGE_TYPE", value: "60 ft." },
      { type: "SPELL_AREA_OF_EFFECT", value: "60-ft.-radius emanation centered on you" },
      { type: "SPELL_DURATION", value: "10 minutes/level" },
      { type: "SPELL_RESISTANCE", value: "Yes (harmless)" },
      { type: "SPELL_COMPONENT", value: "Verbal" },
      { type: "SPELL_COMPONENT", value: "Somatic" },
    ],
  },
];
