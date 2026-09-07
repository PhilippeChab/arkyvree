import type { PowerSeed } from "@/database/packages/dnd35/v1/spells/types.ts";

export const LEVEL_4_SPELLS: PowerSeed[] = [
  {
    name: "Cursed Blade",
    description: "A melee weapon enchanted by this spell inflicts wounds that resist normal healing. Damage dealt directly by the weapon (excluding bonus damage from special properties like flaming, holy, wounding, and similar effects) cannot be healed by any means until the injured creature receives a remove curse spell or an equivalent curse-removing effect. If a creature is slain by a weapon under this spell's effect, it cannot be brought back to life unless remove curse or a similar effect is first cast on the corpse, or unless true resurrection is used.",
    aptitudes: ["Assassin Spells", "Hexblade Spells"],
    savingThrow: "None",
    properties: [
      { type: "SPELL_SCHOOL", value: "Necromancy" },
      { type: "SPELL_CASTING_TIME", value: "1 action" },
      { type: "SPELL_RANGE_TYPE", value: "Touch" },
      { type: "SPELL_TARGET", value: "One melee weapon" },
      { type: "SPELL_DURATION", value: "1 minute/level" },
      { type: "SPELL_RESISTANCE", value: "No" },
      { type: "SPELL_COMPONENT", value: "Verbal" },
    ],
  },
];
