import type { PowerSeed } from "@/database/packages/dnd35/v1/spells/types.ts";

export const LEVEL_3_SPELLS: PowerSeed[] = [
  {
    name: "Hound of Doom",
    description: "You draw upon shadow-stuff from the Plane of Shadow to fashion a loyal, dog-like companion that obeys you for the spell's duration. The hound of doom uses dire wolf statistics with these modifications: it gains a deflection bonus to Armor Class equal to your Charisma bonus, its hit point total at creation equals your full normal hit points, and it uses your base attack bonus in place of its own (still applying its +7 Strength bonus and -1 size penalty as usual). You can direct the hound as a move action, as though it were fully trained in all tricks from the Handle Animal skill. The hound is destroyed if reduced to 0 hit points. It counts as a magical beast for the purposes of spells and effects, but it can also be dispelled. Only one hound of doom can exist at a time; casting this spell again while a previous hound still exists immediately dispels the first one.",
    aptitudes: ["Hexblade Spells"],
    savingThrow: "None",
    properties: [
      { type: "SPELL_SCHOOL", value: "Illusion" },
      { type: "SPELL_SUBSCHOOL", value: "Shadow" },
      { type: "SPELL_CASTING_TIME", value: "1 round" },
      { type: "SPELL_RANGE_TYPE", value: "Close" },
      { type: "SPELL_TARGET", value: "Shadowy hound" },
      { type: "SPELL_DURATION", value: "1 minute/level (D) or until destroyed" },
      { type: "SPELL_RESISTANCE", value: "No" },
      { type: "SPELL_COMPONENT", value: "Verbal" },
      { type: "SPELL_COMPONENT", value: "Somatic" },
    ],
  },
];
