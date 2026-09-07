import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const DUELIST: ClassSeed = {
  name: "Duelist",
  description: "A duelist is an agile and cunning combatant who specializes in delivering accurate strikes using light weaponry.",
  hd: 10, levels: 10, skillPoints: 4,
  bab: "good",
  saves: { fortitude: "poor", reflex: "good", will: "poor" },
  classSkills: ["Balance", "Bluff", "Escape Artist", "Jump", "Listen", "Perform", "Sense Motive", "Spot", "Tumble"],
  requirements: [
    gte("combat.bab", 6),
    gte("skills.perform.rank", 3),
    gte("skills.tumble.rank", 5),
    eq("feats.dodge.possessed"),
    eq("feats.mobility.possessed"),
    eq("feats.weaponfinesse.possessed"),
  ],
  classFeatureAptitude: "Duelist Class Feature",
  classFeatures: [
    [1, "Canny Defense (Duelist)"],
    [1, "Weapon and Armor Proficiency (Duelist)"],
    [2, "Improved Reaction (Duelist)"],
    [3, "Enhanced Mobility (Duelist)"],
    [4, "Grace (Duelist)"],
    [5, "Precise Strike (Duelist)"],
    [6, "Acrobatic Charge (Duelist)"],
    [7, "Elaborate Parry (Duelist)"],
    [8, "Improved Reaction (Duelist)"],
    [10, "Precise Strike (Duelist)"],
  ],
  freeFeats: [
    [9, "Deflect Arrows", "Duelist Class Feature"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
