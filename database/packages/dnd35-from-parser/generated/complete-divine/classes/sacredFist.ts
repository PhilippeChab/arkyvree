import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const SACRED_FIST: ClassSeed = {
  name: "Sacred Fist",
  description: "Sacred fists belong to self-governing orders that operate within the walls of various temples, combining martial discipline with divine power.",
  hd: 8, levels: 10, skillPoints: 4,
  bab: "good",
  saves: { fortitude: "good", reflex: "good", will: "poor" },
  classSkills: ["Balance", "Concentration", "Escape Artist", "Heal", "Jump", "Profession", "Spellcraft", "Tumble"],
  requirements: [
    gte("combat.bab", 4),
    gte("skills.knowledgereligion.rank", 8),
    eq("feats.combatcasting.possessed"),
    eq("feats.combatreflexes.possessed"),
    eq("feats.improvedunarmedstrike.possessed"),
    eq("feats.stunningfist.possessed"),
    gte("spellcasting.divine", 1),
  ],
  casterLevelAdvancement: { type: "divine", levels: [1, 2, 3, 5, 6, 7, 9, 10] },
  classFeatureAptitude: "Sacred Fist Class Feature",
  classFeatures: [
    [1, "AC Bonus (Sacred Fist)"],
    [1, "Fast Movement (Sacred Fist)"],
    [1, "Spells per Day/Spells Known (Sacred Fist)"],
    [1, "Unarmed Damage (Sacred Fist)"],
    [1, "Weapon and Armor Proficiency (Sacred Fist)"],
    [4, "Sacred Flames (Sacred Fist)"],
    [6, "Blindsense (Sacred Fist)"],
    [8, "Sacred Flames (Sacred Fist)"],
    [10, "Inner Armor (Sacred Fist)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
