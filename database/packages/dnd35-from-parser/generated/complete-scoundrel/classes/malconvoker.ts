import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, eqStr, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const MALCONVOKER: ClassSeed = {
  name: "Malconvoker",
  description: "Daring summoners known as malconvokers bargain with their lives.",
  hd: 4, levels: 9, skillPoints: 2,
  bab: "poor",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: [
    "Bluff",
    "Concentration",
    "Craft",
    "Disguise",
    "Knowledge (Arcana)",
    "Knowledge (Religion)",
    "Knowledge (The Planes)",
    "Profession",
    "Spellcraft",
  ],
  requirements: [
    gte("skills.bluff.rank", 4),
    gte("skills.knowledgetheplanes.rank", 4),
    eq("feats.augmentsummoning.possessed"),
    eq("feats.spellfocusconjurationlanguagescelestial.possessed"),
    eq("feats.infernal.possessed"),
    or(
      eqStr("identity.beliefs.alignment", "Lawful Good"),
      eqStr("identity.beliefs.alignment", "Neutral Good"),
      eqStr("identity.beliefs.alignment", "Chaotic Good"),
      eqStr("identity.beliefs.alignment", "Lawful Neutral"),
      eqStr("identity.beliefs.alignment", "True Neutral"),
      eqStr("identity.beliefs.alignment", "Chaotic Neutral"),
    ),
    or(gte("spellcasting.arcane", 1), gte("spellcasting.divine", 1)),
  ],
  casterLevelAdvancement: { type: "any", levels: [2, 3, 4, 5, 6, 7, 8, 9] },
  classFeatureAptitude: "Malconvoker Class Feature",
  classFeatures: [
    [1, "Deceptive Summons (Malconvoker)"],
    [1, "Unrestricted Conjuration (Malconvoker)"],
    [2, "Planar Binding (Malconvoker)"],
    [3, "Skill Focus (Bluff) (Malconvoker)"],
    [4, "Deceptive Summons (Fury) (Malconvoker)"],
    [4, "Deceptive Summons (Malconvoker)"],
    [5, "Fiendish Legion (Malconvoker)"],
    [6, "Deceitful Bargaining (Malconvoker)"],
    [7, "Deceptive Summons (Malconvoker)"],
    [7, "Deceptive Summons (Resistance) (Malconvoker)"],
    [8, "Improved Calling (Malconvoker)"],
    [9, "Safe Summoning (Malconvoker)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
