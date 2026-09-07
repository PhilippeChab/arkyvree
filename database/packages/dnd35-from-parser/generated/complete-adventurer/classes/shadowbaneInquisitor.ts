import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, eqStr, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const SHADOWBANE_INQUISITOR: ClassSeed = {
  name: "Shadowbane Inquisitor",
  description: "Shadowbane inquisitors battle incessantly against evil in whatever form it takes.",
  hd: 10, levels: 10, skillPoints: 4,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: [
    "Climb",
    "Concentration",
    "Craft",
    "Decipher Script",
    "Gather Information",
    "Heal",
    "Hide",
    "Jump",
    "Knowledge (Religion)",
    "Move Silently",
    "Profession",
    "Search",
    "Sense Motive",
    "Swim",
  ],
  requirements: [
    gte("combat.bab", 5),
    gte("skills.gatherinformation.rank", 4),
    gte("skills.knowledgereligion.rank", 2),
    gte("skills.sensemotive.rank", 8),
    eq("feats.powerattack.possessed"),
    eqStr("identity.beliefs.alignment", "Lawful Good"),
    eq("feats.turnorrebukeundead.*.possessed"),
  ],
  classFeatureAptitude: "Shadowbane Inquisitor Class Feature",
  classFeatures: [
    [1, "Absolute Conviction (Shadowbane Inquisitor)"],
    [1, "Pierce Shadows (Shadowbane Inquisitor)"],
    [1, "Weapon and Armor Proficiency (Shadowbane Inquisitor)"],
    [2, "Sacred Stealth (Shadowbane Inquisitor)"],
    [2, "Smite (Shadowbane Inquisitor)"],
    [4, "Sneak Attack (Shadowbane Inquisitor)"],
    [5, "Merciless Purity (Shadowbane Inquisitor)"],
    [6, "Smite (Shadowbane Inquisitor)"],
    [7, "Sacred Stealth (Shadowbane Inquisitor)"],
    [7, "Sneak Attack (Shadowbane Inquisitor)"],
    [8, "Righteous Fervor (Shadowbane Inquisitor)"],
    [9, "Burning Light (Shadowbane Inquisitor)"],
    [10, "Smite (Shadowbane Inquisitor)"],
    [10, "Sneak Attack (Shadowbane Inquisitor)"],
  ],
  freeFeats: [
    [3, "Improved Sunder", "Shadowbane Inquisitor Class Feature"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
