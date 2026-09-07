import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, eqStr, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const HULKING_HURLER: ClassSeed = {
  name: "Hulking Hurler",
  description: "Members of this prestige class are massive creatures who revel in uprooting enormous objects - boulders, trees, even structures - and launching them at enemies with devastating force.",
  hd: 10, levels: 3, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "poor", reflex: "good", will: "poor" },
  classSkills: ["Climb", "Intimidate", "Jump", "Swim"],
  requirements: [
    gte("combat.bab", 5),
    eq("feats.pointblankshot.possessed"),
    eq("feats.powerattack.possessed"),
    eq("feats.weaponfocus.*.possessed"),
    or(
      eqStr("identity.physiology.race.size", "Large"),
      eqStr("identity.physiology.race.size", "Huge"),
      eqStr("identity.physiology.race.size", "Gargantuan"),
      eqStr("identity.physiology.race.size", "Colossal"),
    ),
  ],
  classFeatureAptitude: "Hulking Hurler Class Feature",
  classFeatures: [
    [1, "Catch Weapon (Hulking Hurler)"],
    [1, "Really Throw Anything (Hulking Hurler)"],
    [1, "Weapon and Armor Proficiency (Hulking Hurler)"],
    [2, "Two-handed Hurl Trick (Hulking Hurler)"],
    [3, "Two-handed Hurl Trick (Hulking Hurler)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
