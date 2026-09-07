import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, eqStr, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const FRENZIED_BERSERKER: ClassSeed = {
  name: "Frenzied Berserker",
  description: "Driven by an unquenchable thirst for violence, the frenzied berserker seeks ever-greater conflicts to satiate her relentless appetite for warfare.",
  hd: 12, levels: 10, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: ["Climb", "Intimidate", "Jump", "Ride", "Swim"],
  requirements: [
    gte("combat.bab", 6),
    eq("feats.cleave.possessed"),
    eq("feats.destructiverage.possessed"),
    eq("feats.intimidatingrage.possessed"),
    eq("feats.powerattack.possessed"),
    or(
      eqStr("identity.beliefs.alignment", "Neutral Good"),
      eqStr("identity.beliefs.alignment", "True Neutral"),
      eqStr("identity.beliefs.alignment", "Neutral Evil"),
      eqStr("identity.beliefs.alignment", "Chaotic Good"),
      eqStr("identity.beliefs.alignment", "Chaotic Neutral"),
      eqStr("identity.beliefs.alignment", "Chaotic Evil"),
    ),
  ],
  classFeatureAptitude: "Frenzied Berserker Class Feature",
  classFeatures: [
    [1, "Frenzy (Frenzied Berserker)"],
    [1, "Weapon and Armor Proficiency (Frenzied Berserker)"],
    [2, "Supreme Cleave (Frenzied Berserker)"],
    [3, "Frenzy (Frenzied Berserker)"],
    [4, "Deathless Frenzy (Frenzied Berserker)"],
    [5, "Frenzy (Frenzied Berserker)"],
    [5, "Improved Power Attack (Frenzied Berserker)"],
    [6, "Inspire Frenzy (Frenzied Berserker)"],
    [7, "Frenzy (Frenzied Berserker)"],
    [8, "Greater Frenzy (Frenzied Berserker)"],
    [8, "Inspire Frenzy (Frenzied Berserker)"],
    [9, "Frenzy (Frenzied Berserker)"],
    [10, "Inspire Frenzy (Frenzied Berserker)"],
    [10, "Supreme Power Attack (Frenzied Berserker)"],
    [10, "Tireless Frenzy (Frenzied Berserker)"],
  ],
  freeFeats: [
    [1, "Diehard", "Frenzied Berserker Class Feature"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
