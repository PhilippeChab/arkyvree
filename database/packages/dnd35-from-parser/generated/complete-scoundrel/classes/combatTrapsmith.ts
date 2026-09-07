import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const COMBAT_TRAPSMITH: ClassSeed = {
  name: "Combat Trapsmith",
  description: "Combat trapsmiths can litter a battlefield or dungeon with devices of their own cunning design.",
  hd: 6, levels: 5, skillPoints: 6,
  bab: "medium",
  saves: { fortitude: "good", reflex: "good", will: "poor" },
  classSkills: [
    "Appraise",
    "Balance",
    "Climb",
    "Concentration",
    "Craft",
    "Disable Device",
    "Escape Artist",
    "Hide",
    "Jump",
    "Knowledge (Architecture and Engineering)",
    "Listen",
    "Move Silently",
    "Open Lock",
    "Profession",
    "Search",
    "Spot",
    "Tumble",
    "Use Rope",
  ],
  requirements: [
    gte("skills.craft.rank", 8),
    gte("skills.disabledevice.rank", 6),
    gte("skills.search.rank", 6),
    eq("feats.trapfinding.possessed"),
  ],
  classFeatureAptitude: "Combat Trapsmith Class Feature",
  classFeatures: [
    [1, "Combat Trapping (Combat Trapsmith)"],
    [1, "Trap Sense (Combat Trapsmith)"],
    [2, "Skill Focus (Craft [trapmaking]) (Combat Trapsmith)"],
    [3, "Trap Sense (Combat Trapsmith)"],
    [4, "Improvised Materials (Combat Trapsmith)"],
    [5, "Expert Trapsetter (Combat Trapsmith)"],
    [5, "Trap Sense (Combat Trapsmith)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
