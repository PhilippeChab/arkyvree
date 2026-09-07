import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, eqStr, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const MASTER_TRANSMOGRIFIST: ClassSeed = {
  name: "Master Transmogrifist",
  description: "The master transmogrifist is a sorcerer or wizard who has chosen to specialize in spells that change his form.",
  hd: 4, levels: 10, skillPoints: 2,
  bab: "poor",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: ["Bluff", "Concentration", "Craft", "Disguise", "Knowledge (Arcana)", "Profession", "Spellcraft"],
  requirements: [
    gte("skills.bluff.rank", 2),
    gte("skills.disguise.rank", 5),
    eq("feats.eschewmaterials.possessed"),
    or(
      eqStr("identity.beliefs.alignment", "Neutral Good"),
      eqStr("identity.beliefs.alignment", "True Neutral"),
      eqStr("identity.beliefs.alignment", "Neutral Evil"),
      eqStr("identity.beliefs.alignment", "Chaotic Good"),
      eqStr("identity.beliefs.alignment", "Chaotic Neutral"),
      eqStr("identity.beliefs.alignment", "Chaotic Evil"),
    ),
  ],
  casterLevelAdvancement: { type: "arcane", levels: [2, 3, 5, 6, 8, 9] },
  classFeatureAptitude: "Master Transmogrifist Class Feature",
  classFeatures: [
    [1, "Extended Change (Master Transmogrifist)"],
    [1, "Favored Shape (Master Transmogrifist)"],
    [1, "Spells per Day/Spells Known (Master Transmogrifist)"],
    [1, "Weapon and Armor Proficiency (Master Transmogrifist)"],
    [2, "Manifest Senses (Master Transmogrifist)"],
    [3, "Battle Master (Master Transmogrifist)"],
    [4, "Effortless Change (Master Transmogrifist)"],
    [5, "Shapechanger (Master Transmogrifist)"],
    [6, "Battle Master (Master Transmogrifist)"],
    [7, "Reflexive Change (Master Transmogrifist)"],
    [8, "Manifest Qualities (Master Transmogrifist)"],
    [9, "Battle Master (Master Transmogrifist)"],
    [10, "Infinite Variety (Master Transmogrifist)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
