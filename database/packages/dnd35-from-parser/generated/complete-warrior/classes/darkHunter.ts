import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const DARK_HUNTER: ClassSeed = {
  name: "Dark Hunter",
  description: "Dark hunters are expert trackers and slayers who operate in the lightless depths of underground caverns, specializing in locating and eliminating subterranean threats.",
  hd: 8, levels: 5, skillPoints: 4,
  bab: "good",
  saves: { fortitude: "poor", reflex: "good", will: "poor" },
  classSkills: [
    "Climb",
    "Concentration",
    "Craft",
    "Disable Device",
    "Hide",
    "Knowledge (Dungeoneering)",
    "Listen",
    "Move Silently",
    "Profession",
    "Spot",
    "Survival",
    "Swim",
    "Use Rope",
  ],
  requirements: [
    gte("combat.bab", 5),
    gte("skills.craft.rank", 5),
    gte("skills.knowledgedungeoneering.rank", 2),
    gte("skills.movesilently.rank", 2),
    gte("skills.survival.rank", 2),
    eq("feats.blindfight.possessed"),
    eq("feats.track.possessed"),
  ],
  classFeatureAptitude: "Dark Hunter Class Feature",
  classFeatures: [
    [1, "Improved Stonecunning (Dark Hunter)"],
    [1, "Weapon and Armor Proficiency (Dark Hunter)"],
    [2, "Enhanced Darkvision (Dark Hunter)"],
    [3, "Sneak Attack (Dark Hunter)"],
    [4, "Stone's Hue (Dark Hunter)"],
    [5, "Death Attack (Dark Hunter)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
