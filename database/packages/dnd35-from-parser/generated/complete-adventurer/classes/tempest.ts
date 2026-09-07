import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const TEMPEST: ClassSeed = {
  name: "Tempest",
  description: "A tempest is the point of calm within a whirling barrier of deadly blades.",
  hd: 10, levels: 5, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: ["Balance", "Climb", "Craft", "Intimidate", "Jump", "Swim", "Tumble"],
  requirements: [
    gte("combat.bab", 6),
    eq("feats.dodge.possessed"),
    eq("feats.twoweaponfighting.possessed"),
    eq("feats.improvedtwoweaponfighting.possessed"),
    eq("feats.mobility.possessed"),
    eq("feats.springattack.possessed"),
  ],
  classFeatureAptitude: "Tempest Class Feature",
  classFeatures: [
    [1, "Tempest Defense (Tempest)"],
    [1, "Weapon and Armor Proficiency (Tempest)"],
    [2, "Ambidexterity (Tempest)"],
    [3, "Tempest Defense (Tempest)"],
    [3, "Two-weapon Versatility (Tempest)"],
    [4, "Ambidexterity (Tempest)"],
    [5, "Tempest Defense (Tempest)"],
    [5, "Two-weapon Spring Attack (Tempest)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
