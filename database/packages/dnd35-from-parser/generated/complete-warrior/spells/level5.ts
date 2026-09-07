import type { PowerSeed } from "@/database/packages/dnd35/v1/spells/types.ts";

export const LEVEL_5_SPELLS: PowerSeed[] = [
  {
    name: "Valiant Fury",
    description: "The target gains a +4 morale bonus to Strength and Constitution and a +2 morale bonus on Will saves. Furthermore, when making a full attack action, the affected creature can make one extra attack with any weapon it holds, using its full base attack bonus plus all applicable modifiers. This extra attack does not stack with similar effects such as haste, and it does not provide an additional action that could be used for casting a spell or performing other non-attack activities.",
    aptitudes: [],
    savingThrow: "Will negates (harmless)",
    properties: [
      { type: "SPELL_SCHOOL", value: "Transmutation" },
      { type: "SPELL_CASTING_TIME", value: "1 action" },
      { type: "SPELL_RANGE_TYPE", value: "Close" },
      { type: "SPELL_TARGET", value: "One living creature" },
      { type: "SPELL_DURATION", value: "1 round/level" },
      { type: "SPELL_RESISTANCE", value: "Yes (harmless)" },
      { type: "SPELL_COMPONENT", value: "Verbal" },
      { type: "SPELL_COMPONENT", value: "Somatic" },
      { type: "SPELL_COMPONENT", value: "Divine Focus" },
    ],
  },
];
