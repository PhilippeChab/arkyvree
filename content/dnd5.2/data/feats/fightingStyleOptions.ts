/**
 * The options a paladin's and a ranger's Fighting Style give in place of a Fighting Style feat, a feat each, which the
 * SRD 5.2.1 gives in the feature's text alone: picked in the class's own Fighting Style pool ("Paladin Fighting Style",
 * which its Fighting Style opens and no other class's does), two cantrips on the Cleric's or the Druid's list, picked
 * at the class's level and so cast with its spellcasting ability (a paladin's Charisma, a ranger's Wisdom), as the
 * SRD's "count as Paladin spells for you".
 */

import { classFightingStyle, classSpells } from "@/content/dnd5.2/builders/aptitudes/names.ts";
import { spellRoom } from "@/content/dnd5.2/builders/aptitudes/rooms.ts";
import type { FeatSeed } from "@/content/dnd5.2/builders/feats/types.ts";

/** A paladin's Blessed Warrior and a ranger's Druidic Warrior. */
export const FIGHTING_STYLE_OPTION_FEATS: FeatSeed[] = [
  {
    name: "Blessed Warrior",
    description:
      "You learn two Cleric cantrips of your choice. They count as Paladin spells for you, and Charisma is your spellcasting ability for them.",
    aptitudes: [classFightingStyle("Paladin")],
    modifiers: [spellRoom(classSpells("Cleric"), 0, 2)],
  },
  {
    name: "Druidic Warrior",
    description:
      "You learn two Druid cantrips of your choice. They count as Ranger spells for you, and Wisdom is your spellcasting ability for them.",
    aptitudes: [classFightingStyle("Ranger")],
    modifiers: [spellRoom(classSpells("Druid"), 0, 2)],
  },
];
