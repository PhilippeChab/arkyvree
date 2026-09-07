import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const STREETFIGHTER: ClassSeed = {
  name: "Streetfighter",
  description: "Streetfighters seek the challenges of the back alleys as a way of testing themselves and their experience in the wilder world.",
  hd: 8, levels: 5, skillPoints: 4,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: [
    "Bluff",
    "Climb",
    "Disable Device",
    "Hide",
    "Intimidate",
    "Jump",
    "Knowledge (Local)",
    "Listen",
    "Move Silently",
    "Open Lock",
    "Ride",
    "Search",
    "Spot",
    "Tumble",
  ],
  requirements: [
    gte("combat.bab", 5),
    gte("skills.bluff.rank", 5),
    gte("skills.intimidate.rank", 5),
    gte("skills.knowledgelocal.rank", 5),
    eq("feats.combatexpertise.possessed"),
    eq("feats.improvedfeint.possessed"),
  ],
  classFeatureAptitude: "Streetfighter Class Feature",
  classFeatures: [
    [1, "Always Ready (Streetfighter)"],
    [1, "Streetwise (Streetfighter)"],
    [1, "Weapon and Armor Proficiency (Streetfighter)"],
    [2, "Stand Tough (Streetfighter)"],
    [3, "Always Ready (Streetfighter)"],
    [3, "Sneak Attack (Streetfighter)"],
    [4, "Stand Tough (Streetfighter)"],
    [5, "Always Ready (Streetfighter)"],
    [5, "Uncanny Dodge (Streetfighter)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
