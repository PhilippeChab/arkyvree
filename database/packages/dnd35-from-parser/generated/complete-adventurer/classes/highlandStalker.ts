import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const HIGHLAND_STALKER: ClassSeed = {
  name: "Highland Stalker",
  description: "The mountains are unforgiving, and the ability to ?nd food at high altitude often means the difference between survival and starvation. For those who live in such climes, hunters provide not only food but also clothing, shelter, and tools when they bring back animal skins and bones. The best high-altitude hunters?highland stalkers?are consummate trackers with an instinctive knowledge of their mountainous territories. Scouts are the most likely candidates to become highland stalkers, but rogues are well represented, and the prestige class attracts a fair number of multiclass barbarians and rangers who qualify.",
  hd: 8, levels: 10, skillPoints: 4,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: [
    "Balance",
    "Climb",
    "Craft",
    "Hide",
    "Jump",
    "Knowledge (Geography)",
    "Knowledge (Nature)",
    "Listen",
    "Move Silently",
    "Search",
    "Spot",
    "Survival",
  ],
  requirements: [
    gte("combat.bab", 5),
    gte("skills.listen.rank", 8),
    gte("skills.spot.rank", 8),
    gte("skills.survival.rank", 8),
    eq("feats.track.possessed"),
    eq("feats.sneakattack.possessed"),
  ],
  classFeatureAptitude: "Highland Stalker Class Feature",
  classFeatures: [
    [1, "Mountain Stride (Highland Stalker)"],
    [1, "Weapon and Armor Proficiency (Highland Stalker)"],
    [2, "Skirmish (Highland Stalker)"],
    [3, "Swift Tracker (Highland Stalker)"],
    [4, "Skirmish (Highland Stalker)"],
    [5, "Surefooted (Highland Stalker)"],
    [6, "Skirmish (Highland Stalker)"],
    [7, "Camouflage (Highland Stalker)"],
    [8, "Skirmish (Highland Stalker)"],
    [10, "Skirmish (Highland Stalker)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
