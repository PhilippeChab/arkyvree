import type { PowerSeed } from "@/database/packages/dnd35/v1/spells/types.ts";

export const LEVEL_1_SPELLS: PowerSeed[] = [
  {
    name: "Augment Familiar",
    description: "When cast on your familiar, this spell bestows a +4 enhancement bonus to its Strength, Dexterity, and Constitution scores, grants it damage reduction 5/magic, and gives it a +2 resistance bonus on all saving throws.",
    aptitudes: ["Hexblade Spells", "Sorcerer Spells", "Wizard Spells"],
    aptitudeLevels: { "Hexblade Spells": 1, "Sorcerer Spells": 2, "Wizard Spells": 2 },
    savingThrow: "Fortitude negates (harmless)",
    properties: [
      { type: "SPELL_SCHOOL", value: "Transmutation" },
      { type: "SPELL_CASTING_TIME", value: "1 action" },
      { type: "SPELL_RANGE_TYPE", value: "Close" },
      { type: "SPELL_TARGET", value: "Your familiar" },
      { type: "SPELL_DURATION", value: "Concentration + 1 round/level" },
      { type: "SPELL_RESISTANCE", value: "Yes (harmless)" },
      { type: "SPELL_COMPONENT", value: "Verbal" },
      { type: "SPELL_COMPONENT", value: "Somatic" },
    ],
  },
  {
    name: "Phantom Threat",
    description: "You implant a false perception in the target's mind that it is beset by more opponents than are actually present. The subject does not see or interact with these illusory foes and does not waste attacks on them, but it is treated as flanked regardless of whether any other creatures actually threaten it. No amount of persuasion from others can overcome this effect - only a successful saving throw at the time of casting can prevent it.",
    aptitudes: ["Bard Spells", "Hexblade Spells"],
    savingThrow: "Will negates",
    properties: [
      { type: "SPELL_SCHOOL", value: "Illusion" },
      { type: "SPELL_SUBSCHOOL", value: "Phantasm" },
      { type: "SPELL_DESCRIPTOR", value: "Mind-Affecting" },
      { type: "SPELL_CASTING_TIME", value: "1 action" },
      { type: "SPELL_RANGE_TYPE", value: "Close" },
      { type: "SPELL_TARGET", value: "One creature" },
      { type: "SPELL_DURATION", value: "1 round/level" },
      { type: "SPELL_RESISTANCE", value: "Yes" },
      { type: "SPELL_COMPONENT", value: "Verbal" },
      { type: "SPELL_COMPONENT", value: "Somatic" },
    ],
  },
];
