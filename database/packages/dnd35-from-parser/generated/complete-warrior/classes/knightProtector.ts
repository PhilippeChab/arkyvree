import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const KNIGHT_PROTECTOR: ClassSeed = {
  name: "Knight Protector",
  description: "Knight protectors are warriors who have sworn themselves to upholding the traditions of chivalric honor, striving to keep those noble ideals alive in a world that threatens to abandon them.",
  hd: 10, levels: 10, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: ["Diplomacy", "Intimidate", "Knowledge (Nobility and Royalty)", "Ride", "Spot"],
  requirements: [
    gte("combat.bab", 5),
    gte("skills.diplomacy.rank", 6),
    gte("skills.knowledgenobilityandroyalty.rank", 4),
    gte("skills.ride.rank", 6),
    eq("feats.armorproficiencyheavy.possessed"),
    eq("feats.cleave.possessed"),
    eq("feats.greatcleave.possessed"),
    eq("feats.mountedcombat.possessed"),
    eq("feats.powerattack.possessed"),
  ],
  classFeatureAptitude: "Knight Protector Class Feature",
  classFeatures: [
    [1, "Defensive Stance (Knight Protector)"],
    [1, "Shining Beacon (Knight Protector)"],
    [1, "Weapon and Armor Proficiency (Knight Protector)"],
    [2, "Best Effort (Knight Protector)"],
    [3, "Supreme Cleave (Knight Protector)"],
    [4, "Defensive Stance (Knight Protector)"],
    [5, "Best Effort (Knight Protector)"],
    [6, "No Mercy 1 (Knight Protector)"],
    [7, "Defensive Stance (Knight Protector)"],
    [8, "Best Effort (Knight Protector)"],
    [9, "No Mercy 2 (Knight Protector)"],
    [10, "Defensive Stance (Knight Protector)"],
    [10, "Retributive Attack (Knight Protector)"],
  ],
  freeFeats: [
    [2, "Iron Will", "Knight Protector Class Feature"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
