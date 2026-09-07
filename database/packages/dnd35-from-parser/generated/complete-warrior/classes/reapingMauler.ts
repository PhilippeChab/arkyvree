import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const REAPING_MAULER: ClassSeed = {
  name: "Reaping Mauler",
  description: "Reaping maulers specialize in brutal unarmed grappling techniques, excelling at breaking bones, wrenching limbs, and overpowering foes in close-quarters combat.",
  hd: 10, levels: 5, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "good", reflex: "good", will: "poor" },
  classSkills: ["Climb", "Craft", "Escape Artist", "Intimidate", "Jump", "Perform", "Profession", "Swim", "Tumble"],
  requirements: [
    gte("combat.bab", 5),
    gte("skills.escapeartist.rank", 5),
    gte("skills.tumble.rank", 5),
    eq("feats.cleverwrestling.possessed"),
    eq("feats.improvedunarmedstrike.possessed"),
  ],
  classFeatureAptitude: "Reaping Mauler Class Feature",
  classFeatures: [
    [1, "Weapon and Armor Proficiency (Reaping Mauler)"],
    [2, "Adept Wrestling (Reaping Mauler)"],
    [3, "Counter Grapple (Reaping Mauler)"],
    [3, "Sleeper Lock (Reaping Mauler)"],
    [4, "Adept Wrestling (Reaping Mauler)"],
    [5, "Devastating Grapple (Reaping Mauler)"],
  ],
  freeFeats: [
    [1, "Improved Grapple", "Reaping Mauler Class Feature"],
    [1, "Mobility", "Reaping Mauler Class Feature"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
