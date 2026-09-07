import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, eqStr, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const STONELORD: ClassSeed = {
  name: "Stonelord",
  description: "Certain dwarves develop a profound attunement to the living rock, becoming stonelords who channel the primordial power of the earth itself.",
  hd: 8, levels: 10, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: [
    "Climb",
    "Concentration",
    "Craft",
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
    "Spot",
    "Survival",
  ],
  requirements: [
    gte("combat.bab", 5),
    gte("skills.craft.rank", 6),
    eq("feats.endurance.possessed"),
    eqStr("identity.physiology.race.name", "Dwarf"),
  ],
  classFeatureAptitude: "Stonelord Class Feature",
  classFeatures: [
    [1, "Earth's Blood (Stonelord)"],
    [1, "Weapon and Armor Proficiency (Stonelord)"],
    [2, "Stone Power (Stonelord)"],
    [3, "Stone Shape (Stonelord)"],
    [4, "Stone Power (Stonelord)"],
    [5, "Meld Into Stone (Stonelord)"],
    [6, "Stone Power (Stonelord)"],
    [7, "Stone Tell (Stonelord)"],
    [8, "Stone Power (Stonelord)"],
    [9, "Earthquake (Stonelord)"],
    [10, "Stone Power (Stonelord)"],
  ],
};

// TODO: The character must undergo an arduous ritual involving immersion in sacred loam, long fasting periods deep underground, and the ingestion of 1,000 gp worth of powdered gemstones. The gem type chosen is then the stonelord's totem gem, and she must carry that type of stone with her at all times to access the spell-like abilities she gains as a stonelord
// TODO: No modifiers defined — review if this class needs any
