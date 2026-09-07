import type { PowerSeed } from "@/database/packages/dnd35/v1/spells/types.ts";

export const LEVEL_4_SPELLS: PowerSeed[] = [
  {
    name: "Assassin's Darkness",
    description: "Covering your eyes and spitting a harsh whisper, you conjure a globe of absolute blackness before you.As you step forward, your sight alone pierces the darkness, showing you your disoriented victims within.You call a globe of absolute darkness into being, which only you can see through.All other creatures within or who enter this spell's area are blinded while they remain in the area.Even creatures that have darkvision cannot see through this magical obscurement, although creatures capable of seeing in magical darkness (such as devils) are not affected by it.While you are outside the sphere, you can see nothing within, and every creature within has total concealment.Upon entering the spell's area, however, you can see as if the area were illuminated by bright light and can interact with those within as normal, even though they cannot see you.",
    aptitudes: ["Assassin Spells"],
    savingThrow: "No",
    properties: [
      { type: "SPELL_SCHOOL", value: "Evocation" },
      { type: "SPELL_DESCRIPTOR", value: "Darkness" },
      { type: "SPELL_CASTING_TIME", value: "1 standard action" },
      { type: "SPELL_RANGE_TYPE", value: "Medium" },
      { type: "SPELL_AREA_OF_EFFECT", value: "40-ft.-radius spherical emanation" },
      { type: "SPELL_DURATION", value: "1 minute/level (D)" },
      { type: "SPELL_RESISTANCE", value: "No" },
      { type: "SPELL_COMPONENT", value: "Verbal" },
      { type: "SPELL_COMPONENT", value: "Somatic" },
    ],
  },
  {
    name: "Spell Theft",
    description: "Winding your magical grip around the dweomers that augment your opponent, you rip them away and feel their energy rise around you.You attempt to steal an opponent's beneficial spell effects for yourself.Upon casting this spell, you instantly discern all spells currently affecting the target (including their effects).For each spell so discerned, you can make a dispel check (1d20 + your caster level, maximum +15) against a DC of 11 + the spell's caster level.If the check succeeds, you gain the effect of the spell for the remainder of its duration, as if it had been cast on you instead of the original target, and the opponent loses that effect.Only spells capable of being dispelled can be affected by spell theft.In addition, if you are not a legal target of the spell to be stolen, your dispel check automatically fails.For example, if you cast spell theft on a dire bear affected by bull's strength and animal growth, you could steal only the effect of the first spell unless you were also of the animal type.",
    aptitudes: ["Bard Spells", "Hexblade Spells", "Sorcerer Spells", "Wizard Spells"],
    aptitudeLevels: { "Bard Spells": 4, "Hexblade Spells": 4, "Sorcerer Spells": 5, "Wizard Spells": 5 },
    savingThrow: "None",
    properties: [
      { type: "SPELL_SCHOOL", value: "Abjuration" },
      { type: "SPELL_CASTING_TIME", value: "1 standard action" },
      { type: "SPELL_RANGE_TYPE", value: "Close" },
      { type: "SPELL_TARGET", value: "One creature" },
      { type: "SPELL_DURATION", value: "Instantaneous" },
      { type: "SPELL_RESISTANCE", value: "No" },
      { type: "SPELL_COMPONENT", value: "Verbal" },
      { type: "SPELL_COMPONENT", value: "Somatic" },
    ],
  },
];
