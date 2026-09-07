import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const INVISIBLE_BLADE: ClassSeed = {
  name: "Invisible Blade",
  description: "Invisible blades are lethal combatants who specialize in fighting with daggers and similar small bladed weapons.",
  hd: 6, levels: 5, skillPoints: 4,
  bab: "good",
  saves: { fortitude: "poor", reflex: "good", will: "poor" },
  classSkills: [
    "Balance",
    "Bluff",
    "Climb",
    "Craft",
    "Escape Artist",
    "Hide",
    "Jump",
    "Listen",
    "Move Silently",
    "Perform",
    "Profession",
    "Sense Motive",
    "Spot",
    "Tumble",
  ],
  requirements: [
    gte("skills.bluff.rank", 8),
    gte("skills.sensemotive.rank", 6),
    eq("feats.farshot.possessed"),
    eq("feats.pointblankshot.possessed"),
    eq("feats.weaponfocusdagger.possessed"),
    eq("feats.kukri.possessed"),
    eq("feats.orpunchdagger.possessed"),
  ],
  classFeatureAptitude: "Invisible Blade Class Feature",
  classFeatures: [
    [1, "Dagger Sneak Attack (Invisible Blade)"],
    [1, "Unfettered Defense (Invisible Blade)"],
    [1, "Weapon and Armor Proficiency (Invisible Blade)"],
    [2, "Bleeding Wound (Invisible Blade)"],
    [3, "Dagger Sneak Attack (Invisible Blade)"],
    [3, "Uncanny Feint (Invisible Blade)"],
    [4, "Feint Mastery (Invisible Blade)"],
    [5, "Dagger Sneak Attack (Invisible Blade)"],
    [5, "Uncanny Feint (Invisible Blade)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
