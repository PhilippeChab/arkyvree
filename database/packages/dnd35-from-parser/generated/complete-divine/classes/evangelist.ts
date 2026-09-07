import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const EVANGELIST: ClassSeed = {
  name: "Evangelist",
  description: "Wandering preachers devoted to a specific god, pantheon, or religious philosophy, evangelists journey across the land spreading the word of their faith.",
  hd: 6, levels: 5, skillPoints: 6,
  bab: "medium",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: [
    "Bluff",
    "Craft",
    "Diplomacy",
    "Disguise",
    "Escape Artist",
    "Intimidate",
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
    "Listen",
    "Perform",
    "Profession",
    "Sense Motive",
    "Speak Language",
  ],
  requirements: [
    gte("skills.bluff.rank", 8),
    gte("skills.gatherinformation.rank", 5),
    gte("skills.knowledgereligion.rank", 5),
    gte("skills.perform.rank", 6),
    gte("skills.sensemotive.rank", 5),
    eq("feats.negotiatoror.possessed"),
    eq("feats.persuasive.possessed"),
  ],
  classFeatureAptitude: "Evangelist Class Feature",
  classFeatures: [
    [1, "Great Orator (Inspire Dread or Inspire Hope) (Evangelist)"],
    [1, "Weapon and Armor Proficiency (Evangelist)"],
    [2, "Fast Talk (Evangelist)"],
    [3, "Great Orator (Inflame the Righteous) (Evangelist)"],
    [4, "Skill Mastery (Evangelist)"],
    [5, "Great Orator (Convert the Unfaithful) (Evangelist)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
