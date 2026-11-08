/**
 * The sacred roles a cleric's Divine Order and a druid's Primal Order choose between, a feat each, which the SRD 5.2.1
 * gives in the feature's text alone: one is picked in the order's pool at the class's first level. A martial role
 * grants its armor training and Martial weapons; a spellcasting role an extra cantrip on its class's list, and its
 * Wisdom modifier (+1 at least) to two Intelligence skills' checks.
 */

import { bonus } from "@/content/core/builders/customization/modifiers.ts";
import { classSpells, DIVINE_ORDER_POOL, PRIMAL_ORDER_POOL } from "@/content/dnd5/builders/aptitudes/names.ts";
import { spellRoom } from "@/content/dnd5/builders/aptitudes/rooms.ts";
import { grantFeat } from "@/content/dnd5/builders/feats/possession.ts";
import { armorTraining, weaponProficiency } from "@/content/dnd5/builders/feats/proficiencies.ts";
import type { FeatSeed } from "@/content/dnd5/builders/feats/types.ts";

/** The Wisdom modifier a spellcasting role adds to two skills' checks, +1 at least. */
const WISDOM_BONUS = "{{ max(1, [abilities.wisdom.modifier]) }}";

/** A cleric's Divine Order's roles: the Protector's and the Thaumaturge's. */
export const DIVINE_ORDER_FEATS: FeatSeed[] = [
  {
    name: "Divine Order: Protector",
    description: "Trained for battle, you gain proficiency with Martial weapons and training with Heavy armor.",
    aptitudes: [DIVINE_ORDER_POOL],
    modifiers: [grantFeat(weaponProficiency("Martial Weapons")), grantFeat(armorTraining("Heavy Armor"))],
  },
  {
    name: "Divine Order: Thaumaturge",
    description:
      "You know one extra cantrip from the Cleric spell list. In addition, your mystical connection to the divine gives you a bonus to your Intelligence (Arcana or Religion) checks. The bonus equals your Wisdom modifier (minimum of +1).",
    aptitudes: [DIVINE_ORDER_POOL],
    modifiers: [
      spellRoom(classSpells("Cleric"), 0, 1),
      bonus("skills.arcana.misc", WISDOM_BONUS),
      bonus("skills.religion.misc", WISDOM_BONUS),
    ],
  },
];

/** A druid's Primal Order's roles: the Magician's and the Warden's. */
export const PRIMAL_ORDER_FEATS: FeatSeed[] = [
  {
    name: "Primal Order: Magician",
    description:
      "You know one extra cantrip from the Druid spell list. In addition, your mystical connection to nature gives you a bonus to your Intelligence (Arcana or Nature) checks. The bonus equals your Wisdom modifier (minimum bonus of +1).",
    aptitudes: [PRIMAL_ORDER_POOL],
    modifiers: [
      spellRoom(classSpells("Druid"), 0, 1),
      bonus("skills.arcana.misc", WISDOM_BONUS),
      bonus("skills.nature.misc", WISDOM_BONUS),
    ],
  },
  {
    name: "Primal Order: Warden",
    description: "Trained for battle, you gain proficiency with Martial weapons and training with Medium armor.",
    aptitudes: [PRIMAL_ORDER_POOL],
    modifiers: [grantFeat(weaponProficiency("Martial Weapons")), grantFeat(armorTraining("Medium Armor"))],
  },
];
