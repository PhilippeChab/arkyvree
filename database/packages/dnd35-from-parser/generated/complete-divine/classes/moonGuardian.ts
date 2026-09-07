import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eqStr, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const MOON_GUARDIAN: ClassSeed = {
  name: "Moon Guardian",
  description: "When an evil lycanthrope transmits the curse of lycanthropy to a victim, the afflicted individual must either seek a swift cure or gradually fall under the savage, malevolent influence of their bestial side. However, good or neutral divine spellcasters who maintain powerful bonds with their patron deities or chosen divine forces can sometimes leverage those spiritual connections to resist the descent into evil. Those who manage this feat become known as moon guardians.",
  hd: 8, levels: 5, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "good", reflex: "good", will: "poor" },
  classSkills: ["Concentration", "Craft", "Knowledge (Religion)", "Spellcraft"],
  requirements: [
    gte("spellcasting.divine", 3),
    or(eqStr("identity.beliefs.alignment", "Lawful Good"), eqStr("identity.beliefs.alignment", "Neutral Good"), eqStr("identity.beliefs.alignment", "Chaotic Good")),
  ],
  casterLevelAdvancement: { type: "divine", levels: [2, 4] },
  classFeatureAptitude: "Moon Guardian Class Feature",
  classFeatures: [
    [1, "Spells per Day/Spells Known (Moon Guardian)"],
    [1, "Voluntary Change (Moon Guardian)"],
    [1, "Weapon and Armor Proficiency (Moon Guardian)"],
    [3, "Rapid Change (Moon Guardian)"],
    [5, "Instantaneous Change (Moon Guardian)"],
  ],
  freeFeats: [
    [1, "Natural Spell", "Moon Guardian Class Feature"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
