import type { PowerSeed } from "@/database/packages/dnd35/v1/spells/types.ts";

export const LEVEL_9_SPELLS: PowerSeed[] = [
  {
    name: "Cloak of Bravery, Greater",
    description: "This enhanced version of cloak of bravery renders you and all allies within the emanation completely immune to fear effects and also grants them a +2 morale bonus on attack rolls. Allies who lack line of sight to you do not benefit from this spell.",
    aptitudes: [],
    savingThrow: "None",
    properties: [
      { type: "SPELL_SCHOOL", value: "Abjuration" },
      { type: "SPELL_DESCRIPTOR", value: "Mind-Affecting" },
      { type: "SPELL_CASTING_TIME", value: "1 standard action" },
      { type: "SPELL_RANGE_TYPE", value: "1 mile; see text" },
      { type: "SPELL_AREA_OF_EFFECT", value: "1-mile-radius emanation centered on you" },
      { type: "SPELL_DURATION", value: "1 hour/level" },
      { type: "SPELL_RESISTANCE", value: "No" },
    ],
  },
];
