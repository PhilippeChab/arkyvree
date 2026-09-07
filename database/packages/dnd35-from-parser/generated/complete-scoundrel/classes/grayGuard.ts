import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, eqStr, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const GRAY_GUARD: ClassSeed = {
  name: "Gray Guard",
  description: "Gray guards are less restrained by their knightly vows, doing what must be done, no matter how unpleasant.",
  hd: 10, levels: 10, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "good" },
  classSkills: [
    "Bluff",
    "Concentration",
    "Disguise",
    "Forgery",
    "Handle Animal",
    "Heal",
    "Intimidate",
    "Knowledge (Local)",
    "Knowledge (Nobility and Royalty)",
    "Knowledge (Religion)",
    "Ride",
    "Sense Motive",
  ],
  requirements: [
    gte("skills.knowledgereligion.rank", 8),
    gte("skills.sensemotive.rank", 4),
    eqStr("identity.beliefs.alignment", "Lawful Good"),
    eq("feats.layonhands.possessed"),
  ],
  casterLevelAdvancement: { type: "divine", levels: [2, 4, 6, 8, 10] },
  classFeatureAptitude: "Gray Guard Class Feature",
  classFeatures: [
    [1, "Lay on Hands (Gray Guard)"],
    [1, "Sacrament of Trust (Gray Guard)"],
    [2, "Debilitating Touch (Gray Guard)"],
    [3, "Smite Evil (Gray Guard)"],
    [4, "Justice Blade (Chaos) (Gray Guard)"],
    [5, "Devastating Touch (Gray Guard)"],
    [7, "Unbound Justice (Gray Guard)"],
    [8, "Smite Evil (Gray Guard)"],
    [9, "Justice Blade (All Alignments) (Gray Guard)"],
    [10, "Sacrament of the True Faith (Gray Guard)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
