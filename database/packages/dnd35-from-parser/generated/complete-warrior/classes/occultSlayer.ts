import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const OCCULT_SLAYER: ClassSeed = {
  name: "Occult Slayer",
  description: "An occult slayer is a dedicated warrior who relentlessly pursues and confronts wielders of arcane and divine magic.",
  hd: 8, levels: 5, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: [
    "Bluff",
    "Craft",
    "Gather Information",
    "Knowledge (Arcana)",
    "Profession",
    "Sense Motive",
    "Spellcraft",
  ],
  requirements: [
    gte("combat.bab", 5),
    gte("skills.knowledgearcana.rank", 4),
    gte("skills.spellcraft.rank", 3),
    eq("feats.improvedinitiative.possessed"),
    eq("feats.weaponfocus.*.possessed"),
  ],
  classFeatureAptitude: "Occult Slayer Class Feature",
  classFeatures: [
    [1, "Magical Defense (Occult Slayer)"],
    [1, "Weapon and Armor Proficiency (Occult Slayer)"],
    [1, "Weapon Bond (Occult Slayer)"],
    [2, "Mind Over Magic (Occult Slayer)"],
    [2, "Vicious Strike (Occult Slayer)"],
    [3, "Auravision (Occult Slayer)"],
    [3, "Magical Defense (Occult Slayer)"],
    [4, "Mind Over Magic (Occult Slayer)"],
    [4, "Nondetection Cloak (Occult Slayer)"],
    [5, "Blank Thoughts (Occult Slayer)"],
    [5, "Magical Defense (Occult Slayer)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
