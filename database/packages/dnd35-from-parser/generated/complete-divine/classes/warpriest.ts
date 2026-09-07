import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const WARPRIEST: ClassSeed = {
  name: "Warpriest",
  description: "Warpriests are battle-hardened divine spellcasters who desire peace yet stand ever ready for combat.",
  hd: 10, levels: 10, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: [
    "Concentration",
    "Craft",
    "Diplomacy",
    "Handle Animal",
    "Knowledge (History)",
    "Ride",
    "Sense Motive",
    "Spellcraft",
    "Swim",
  ],
  requirements: [
    gte("combat.bab", 5),
    gte("skills.diplomacy.rank", 8),
    gte("skills.sensemotive.rank", 5),
    eq("feats.combatcasting.possessed"),
    eq("feats.turnorrebukeundead.*.possessed"),
  ],
  casterLevelAdvancement: { type: "divine", levels: [2, 4, 6, 8, 10] },
  classFeatureAptitude: "Warpriest Class Feature",
  classFeatures: [
    [1, "Rally (Warpriest)"],
    [1, "Spells per Day/Spells Known (Warpriest)"],
    [1, "Turn or Rebuke Undead (Warpriest)"],
    [1, "Weapon and Armor Proficiency (Warpriest)"],
    [2, "Inflame (Warpriest)"],
    [3, "Mass Cure Light Wounds (Warpriest)"],
    [4, "Inflame (Warpriest)"],
    [5, "Fear Aura (Warpriest)"],
    [6, "Heroes' Feast (Warpriest)"],
    [6, "Inflame (Warpriest)"],
    [7, "Haste (Warpriest)"],
    [9, "Mass Heal (Warpriest)"],
    [10, "Implacable Foe (Warpriest)"],
    [10, "Inflame (Warpriest)"],
  ],
  freeFeats: [
    [1, "Bonus Domain", "Warpriest Class Feature"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
