import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, eqStr, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const EYE_OF_GRUUMSH: ClassSeed = {
  name: "Eye of Gruumsh",
  description: "An orc or half-orc called to serve Gruumsh as his living vessel can pursue the path of the eye of Gruumsh, becoming a fearsome war leader devoted to the one-eyed god.",
  hd: 12, levels: 10, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: ["Climb", "Intimidate", "Jump", "Ride", "Survival", "Swim"],
  requirements: [
    gte("combat.bab", 6),
    eq("feats.exoticweaponproficiencyorcdoubleaxe.possessed"),
    eq("feats.weaponfocusorcdoubleaxe.possessed"),
    or(eqStr("identity.beliefs.alignment", "Chaotic Evil"), eqStr("identity.beliefs.alignment", "Chaotic Neutral"), eqStr("identity.beliefs.alignment", "Neutral Evil")),
    eqStr("identity.physiology.race.name", "Half-Orc"),
  ],
  classFeatureAptitude: "Eye of Gruumsh Class Feature",
  classFeatures: [
    [1, "Command the Horde (Eye of Gruumsh)"],
    [1, "Rage (Eye of Gruumsh)"],
    [1, "Weapon and Armor Proficiency (Eye of Gruumsh)"],
    [2, "Swing Blindly (Eye of Gruumsh)"],
    [3, "Ritual Scarring (Eye of Gruumsh)"],
    [4, "Blinding Spittle (Eye of Gruumsh)"],
    [5, "Blindsight (Eye of Gruumsh)"],
    [6, "Ritual Scarring (Eye of Gruumsh)"],
    [7, "Blinding Spittle (Eye of Gruumsh)"],
    [8, "Blindsight (Eye of Gruumsh)"],
    [9, "Ritual Scarring (Eye of Gruumsh)"],
    [10, "Sight of Gruumsh (Eye of Gruumsh)"],
  ],
  freeFeats: [
    [1, "Blind-Fight", "Eye of Gruumsh Class Feature"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
