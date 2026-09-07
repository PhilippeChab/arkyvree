import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eqStr, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const AVENGING_EXECUTIONER: ClassSeed = {
  name: "Avenging Executioner",
  description: "Relentless and inventive, these stalkers wield psychology as deftly as their weapons.",
  hd: 8, levels: 5, skillPoints: 6,
  bab: "medium",
  saves: { fortitude: "poor", reflex: "good", will: "good" },
  classSkills: [
    "Balance",
    "Bluff",
    "Climb",
    "Craft",
    "Disguise",
    "Escape Artist",
    "Hide",
    "Intimidate",
    "Jump",
    "Listen",
    "Move Silently",
    "Open Lock",
    "Profession",
    "Spot",
    "Use Rope",
  ],
  requirements: [
    gte("combat.bab", 5),
    gte("skills.hide.rank", 4),
    gte("skills.intimidate.rank", 6),
    gte("skills.movesilently.rank", 4),
    or(
      eqStr("identity.beliefs.alignment", "Lawful Neutral"),
      eqStr("identity.beliefs.alignment", "True Neutral"),
      eqStr("identity.beliefs.alignment", "Chaotic Neutral"),
      eqStr("identity.beliefs.alignment", "Lawful Evil"),
      eqStr("identity.beliefs.alignment", "Neutral Evil"),
      eqStr("identity.beliefs.alignment", "Chaotic Evil"),
    ),
  ],
  classFeatureAptitude: "Avenging Executioner Class Feature",
  classFeatures: [
    [1, "Bloody Blade (Avenging Executioner)"],
    [1, "Sudden Strike (Avenging Executioner)"],
    [2, "Rapid Intimidation (Avenging Executioner)"],
    [3, "Sudden Strike (Avenging Executioner)"],
    [4, "Dread Blade (Avenging Executioner)"],
    [5, "Bloody Murder (Avenging Executioner)"],
    [5, "Sudden Strike (Avenging Executioner)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
