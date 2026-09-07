import type { PowerSeed } from "@/database/packages/dnd35/v1/spells/types.ts";

export const CANTRIPS: PowerSeed[] = [
  {
    name: "Maelstrom",
    description: "You create a deadly whirlpool in a body of water. The water must be at least 120 feet wide and 60 feet deep, or the spell is wasted. Waterborne creatures or objects within 50 feet of the vortex (below and on all sides) must succeed on Reflex saves or be drawn in. Trained swimmers may attempt Swim checks instead if their modifier exceeds their Reflex bonus. Vessel operators may make Profession (sailor) checks against the same DC. Creatures and objects sucked in take 3d8 points of damage upon entry. Once inside, they take 3d8 bludgeoning damage each round and remain trapped for 2d4 rounds. Subjects of Large or smaller size are ejected from the bottom; larger subjects are expelled from the top.",
    aptitudes: [],
    savingThrow: "Reflex negates (and see text)",
    properties: [
      { type: "SPELL_SCHOOL", value: "Conjuration" },
      { type: "SPELL_SUBSCHOOL", value: "Creation" },
      { type: "SPELL_CASTING_TIME", value: "1 full round" },
      { type: "SPELL_RANGE_TYPE", value: "Long" },
      { type: "SPELL_TARGET", value: "A whirlpool 120 ft. wide and 60 ft. deep" },
      { type: "SPELL_DURATION", value: "1 round/level" },
      { type: "SPELL_RESISTANCE", value: "No" },
      { type: "SPELL_COMPONENT", value: "Verbal" },
      { type: "SPELL_COMPONENT", value: "Somatic" },
      { type: "SPELL_COMPONENT", value: "Divine Focus" },
    ],
  },
  {
    name: "Naturewatch",
    description: "Functions identically to deathwatch, but applies only to animals and plants. Additionally, it reveals miscellaneous mundane information about the observed creatures and plants (such as whether plants are dehydrated or animals are malnourished).",
    aptitudes: ["Druid Spells", "Ranger Spells"],
    aptitudeLevels: { "Druid Spells": 0, "Ranger Spells": 1 },
    savingThrow: "None",
    properties: [
      { type: "SPELL_SCHOOL", value: "Necromancy" },
      { type: "SPELL_CASTING_TIME", value: "1 standard action" },
      { type: "SPELL_RANGE_TYPE", value: "Close" },
      { type: "SPELL_TARGET", value: "Quarter circle emanating from you to the extreme of the range" },
      { type: "SPELL_DURATION", value: "10 min./level" },
      { type: "SPELL_RESISTANCE", value: "No" },
      { type: "SPELL_COMPONENT", value: "Somatic" },
    ],
  },
];
