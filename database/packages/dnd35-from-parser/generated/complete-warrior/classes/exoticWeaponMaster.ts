import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const EXOTIC_WEAPON_MASTER: ClassSeed = {
  name: "Exotic Weapon Master",
  description: "Becoming an exotic weapon master demands nothing more than dedication and relentless practice with unusual armaments.",
  hd: 10, levels: 3, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: ["Craft", "Intimidate", "Profession"],
  requirements: [
    gte("combat.bab", 6),
    gte("skills.craft.rank", 3),
    eq("feats.exoticweaponproficiency.*.possessed"),
    eq("feats.weaponfocus.*.possessed"),
  ],
  classFeatureAptitude: "Exotic Weapon Master Class Feature",
  classFeatures: [
    [1, "Exotic Weapon Stunt (Exotic Weapon Master)"],
    [1, "Weapon and Armor Proficiency (Exotic Weapon Master)"],
    [2, "Exotic Weapon Stunt (Exotic Weapon Master)"],
    [3, "Exotic Weapon Stunt (Exotic Weapon Master)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
