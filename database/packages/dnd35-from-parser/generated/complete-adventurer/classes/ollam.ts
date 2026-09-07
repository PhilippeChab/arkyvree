import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eqStr, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const OLLAM: ClassSeed = {
  name: "Ollam",
  description: "In Dwarven, the word ?ollam' means teacher. The education of the dwarf people is considered a sacred duty, and those who are considered knowledgeable in dwarf history and legend - and thought to possess above-average common sense - are often called upon to take up the respected role of teacher in the community. While other cultures might see this as a job for young girls or old men, the dwarves see an ollam as a protector of their cherished culture. No one in the dwarf community takes that position lightly. An ollam is granted a special position in the temple hierarchy - Moradin gives her spells that allow her not only to delve into the secrets of the universe but also to heal and keep an eye on her charges. While most ollams are clerics or bards, individuals of other classes are welcomed, as long as they possess the knowledge needed to teach the children properly.",
  hd: 8, levels: 5, skillPoints: 6,
  bab: "poor",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: [
    "Concentration",
    "Craft",
    "Decipher Script",
    "Diplomacy",
    "Gather Information",
    "Heal",
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
    "Search",
    "Sense Motive",
    "Speak Language",
    "Spellcraft",
  ],
  requirements: [
    gte("skills.knowledgehistory.rank", 10),
    gte("skills.knowledge.rank", 10),
    gte("skills.perform.rank", 5),
    eqStr("identity.beliefs.alignment", "Lawful Good"),
    eqStr("identity.physiology.race.name", "Dwarf"),
  ],
  casterLevelAdvancement: { type: "any", levels: [2, 3, 4] },
  classFeatureAptitude: "Ollam Class Feature",
  classFeatures: [
    [1, "Lore (Ollam)"],
    [1, "Spells per Day/Spells Known (Ollam)"],
    [1, "Weapon and Armor Proficiency (Ollam)"],
    [3, "Inspire Competence (Ollam)"],
    [5, "Inspire Resilience (Ollam)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
