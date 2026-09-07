import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const SPELLWARP_SNIPER: ClassSeed = {
  name: "Spellwarp Sniper",
  description: "The spellwarp sniper contorts spells, changing area effects into rays that deliver precise, devastating attacks.",
  hd: 6, levels: 5, skillPoints: 4,
  bab: "medium",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: [
    "Concentration",
    "Craft",
    "Hide",
    "Intimidate",
    "Knowledge (Arcana)",
    "Move Silently",
    "Profession",
    "Spellcraft",
    "Spot",
  ],
  requirements: [
    gte("skills.concentration.rank", 8),
    gte("skills.spellcraft.rank", 8),
    or(gte("spellcasting.arcane", 3), gte("spellcasting.divine", 3)),
    or(gte("feats.sneakattack.count", 1), gte("feats.suddenstrike.count", 1)),
  ],
  casterLevelAdvancement: { type: "any", levels: [1, 2, 3, 4, 5] },
  classFeatureAptitude: "Spellwarp Sniper Class Feature",
  classFeatures: [
    [1, "Spellwarp (Spellwarp Sniper)"],
    [2, "Sudden Raystrike (Spellwarp Sniper)"],
    [4, "Sudden Raystrike (Spellwarp Sniper)"],
    [5, "Ray Mastery (Spellwarp Sniper)"],
  ],
  freeFeats: [
    [3, "Precise Shot", "Spellwarp Sniper Class Feature"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
