import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const THAUMATURGIST: ClassSeed = {
  name: "Thaumaturgist",
  description: "This prestige class specializes in using divine magic to reach across planar boundaries, summoning and bargaining with extraplanar beings to serve the caster's purposes.",
  hd: 4, levels: 5, skillPoints: 2,
  bab: "poor",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: [
    "Concentration",
    "Craft",
    "Diplomacy",
    "Knowledge (Religion)",
    "Knowledge (The Planes)",
    "Profession",
    "Sense Motive",
    "Speak Language",
    "Spellcraft",
  ],
  requirements: [
    eq("feats.spellfocusconjuration.possessed"),
    gte("spellcasting.divine", 3),
  ],
  casterLevelAdvancement: { type: "any", levels: [1, 2, 3, 4, 5] },
  classFeatureAptitude: "Thaumaturgist Class Feature",
  classFeatures: [
    [1, "Improved Ally (Thaumaturgist)"],
    [1, "Spells per Day (Thaumaturgist)"],
    [1, "Weapon and Armor Proficiency (Thaumaturgist)"],
    [3, "Extended Summoning (Thaumaturgist)"],
    [4, "Contingent Conjuration (Thaumaturgist)"],
    [5, "Planar Cohort (Thaumaturgist)"],
  ],
  freeFeats: [
    [2, "Augment Summoning", "Thaumaturgist Class Feature"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
