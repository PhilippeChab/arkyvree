import { stripSeparators } from "@/shared/utils.ts";
import type { FeatSeed } from "@/database/packages/dnd35/v1/feats/types.ts";

export const SKILL_NAMES = [
  "Appraise", "Balance", "Bluff", "Climb", "Concentration", "Craft",
  "Decipher Script", "Diplomacy", "Disable Device", "Disguise",
  "Escape Artist", "Forgery", "Gather Information", "Handle Animal",
  "Heal", "Hide", "Intimidate", "Jump",
  "Knowledge (Arcana)", "Knowledge (Architecture and Engineering)",
  "Knowledge (Dungeoneering)", "Knowledge (Geography)", "Knowledge (History)",
  "Knowledge (Local)", "Knowledge (Nature)", "Knowledge (Nobility and Royalty)",
  "Knowledge (Psionics)", "Knowledge (Religion)", "Knowledge (The Planes)",
  "Listen", "Move Silently", "Open Lock", "Perform", "Profession", "Ride",
  "Search", "Sense Motive", "Sleight of Hand", "Spellcraft", "Spot",
  "Survival", "Swim", "Tumble", "Use Magic Device", "Use Rope",
];

export const SKILL_SPECIFIC_FEATS: FeatSeed[] = SKILL_NAMES.map((s) => ({
  name: `Skill Focus: ${s}`,
  description: `You get a +3 bonus on all checks involving ${s}.`,
  aptitudes: ["General"],
  modifiers: [
    { target: `skills.${stripSeparators(s)}.misc`, operator: "add", value: "3", valueType: "number" },
  ],
  properties: [{ type: "FEAT_FAMILY", value: "Skill Focus" }],
}));
