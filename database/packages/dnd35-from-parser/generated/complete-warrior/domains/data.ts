import type { DomainDefinition } from "@/database/packages/dnd35/v1/domains/types.ts";

export const ALL_DOMAINS: DomainDefinition[] = [
  {
    name: "Courage",
    description: "You continuously emit a supernatural aura of bravery that provides you and all allies within 10 feet a +4 morale bonus on saving throws made to resist fear effects. This aura operates whenever you are conscious but ceases to function if you fall unconscious or die.",
    spells: [
      { name: "Remove Fear", level: 1 },
      { name: "Aid", level: 2 },
      { name: "Cloak of Bravery", level: 3 },
      { name: "Heroism", level: 4 },
      { name: "Valiant Fury", level: 5 },
      { name: "Heroes' Feast", level: 6 },
      { name: "Heroism, Greater", level: 7 },
      { name: "Lion's Roar", level: 8 },
      { name: "Cloak of Bravery, Greater", level: 9 },
    ],
  },
];
