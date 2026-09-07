import type { PowerSeed } from "@/database/packages/dnd35/v1/spells/types.ts";

export const LEVEL_8_SPELLS: PowerSeed[] = [
  {
    name: "Lion's Roar",
    description: "You unleash a thunderous roar that inflicts 1d8 points of sonic damage per two caster levels upon all enemies in the area and stuns them for 1 round. A successful Fortitude save reduces the damage by half and prevents the stunning. Additionally, all allies within the area receive a +1 morale bonus on attack rolls and saving throws against fear effects, along with temporary hit points equal to 1d8 + your caster level (capped at 1d8+20 at 20th caster level).",
    aptitudes: ["Cleric Spells"],
    savingThrow: "Fortitude partial or Will negates (harmless); see text",
    properties: [
      { type: "SPELL_SCHOOL", value: "Evocation" },
      { type: "SPELL_DESCRIPTOR", value: "Sonic" },
      { type: "SPELL_CASTING_TIME", value: "1 action" },
      { type: "SPELL_RANGE_TYPE", value: "120 ft." },
      { type: "SPELL_AREA_OF_EFFECT", value: "120-ft.-radius burst centered on you" },
      { type: "SPELL_DURATION", value: "Instantaneous or 1 minute/level" },
      { type: "SPELL_RESISTANCE", value: "Yes or Yes (harmless); see text" },
      { type: "SPELL_COMPONENT", value: "Verbal" },
      { type: "SPELL_COMPONENT", value: "Somatic" },
      { type: "SPELL_COMPONENT", value: "Divine Focus" },
    ],
  },
];
