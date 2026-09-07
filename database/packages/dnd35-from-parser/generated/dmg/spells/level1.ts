import type { PowerSeed } from "@/database/packages/dnd35/v1/spells/types.ts";

export const LEVEL_1_SPELLS: PowerSeed[] = [
  {
    name: "Corrupt Weapon",
    description: "Through transmutation magic, you imbue a weapon with malevolent power effective against good-aligned opponents. The weapon gains the equivalent of a +1 enhancement bonus solely for overcoming the damage reduction of good creatures and for hitting good incorporeal beings, though it does not actually receive a numeric enhancement bonus. The weapon takes on an evil alignment, allowing it to penetrate the damage reduction of certain foes, especially good outsiders. This evil alignment replaces and suppresses any prior alignment the weapon possessed. Single pieces of ammunition such as arrows or bolts may be affected, but a projectile launcher like a bow does not pass this benefit on to its ammunition. Furthermore, every confirmed threat against a good-aligned target automatically becomes a critical hit. However, this automatic critical confirmation does not function on weapons that already possess a magical property affecting critical hits, such as the keen or vorpal properties.",
    aptitudes: ["Blackguard Spells"],
    savingThrow: "None",
    properties: [
      { type: "SPELL_SCHOOL", value: "Transmutation" },
      { type: "SPELL_CASTING_TIME", value: "1 standard action" },
      { type: "SPELL_RANGE_TYPE", value: "Touch" },
      { type: "SPELL_TARGET", value: "Weapon touched" },
      { type: "SPELL_DURATION", value: "1 min./level" },
      { type: "SPELL_RESISTANCE", value: "No" },
      { type: "SPELL_COMPONENT", value: "Verbal" },
      { type: "SPELL_COMPONENT", value: "Somatic" },
    ],
  },
];
