import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const SPELLSWORD: ClassSeed = {
  name: "Spellsword",
  description: "A spellsword represents the ideal union of arcane magic and armed combat.",
  hd: 8, levels: 10, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "good" },
  classSkills: [
    "Climb",
    "Concentration",
    "Jump",
    "Knowledge (Arcana)",
    "Knowledge (Architecture and Engineering)",
    "Knowledge (Dungeoneering)",
    "Knowledge (Geography)",
    "Knowledge (History)",
    "Knowledge (Local)",
    "Knowledge (Nature)",
    "Knowledge (Nobility and Royalty)",
    "Knowledge (Psionics)",
    "Knowledge (Religion)",
    "Knowledge (The Planes)",
    "Profession",
    "Spellcraft",
  ],
  requirements: [
    gte("combat.bab", 4),
    gte("skills.knowledgearcana.rank", 6),
    eq("feats.proficiencywithallsimple.possessed"),
    eq("feats.martialweapons.possessed"),
    eq("feats.withallarmorheavy.possessed"),
    eq("feats.medium.possessed"),
    eq("feats.light.possessed"),
    gte("spellcasting.arcane", 2),
  ],
  casterLevelAdvancement: { type: "arcane", levels: [1, 3, 5, 7, 9] },
  classFeatureAptitude: "Spellsword Class Feature",
  classFeatures: [
    [1, "Ignore Spell Failure (Spellsword)"],
    [1, "Spells per Day (Spellsword)"],
    [2, "Bonus Feat (Spellsword)"],
    [3, "Ignore Spell Failure (Spellsword)"],
    [4, "Channel Spell (Spellsword)"],
    [5, "Ignore Spell Failure (Spellsword)"],
    [6, "Channel Spell (Spellsword)"],
    [7, "Ignore Spell Failure (Spellsword)"],
    [8, "Channel Spell (Spellsword)"],
    [9, "Ignore Spell Failure (Spellsword)"],
    [10, "Multiple Channel Spell (Spellsword)"],
  ],
  aptitudePicks: [
    { levels: [2], target: "aptitudes.fighterbonusfeat.allowed" },
  ],
};

// TODO: No modifiers defined — review if this class needs any
