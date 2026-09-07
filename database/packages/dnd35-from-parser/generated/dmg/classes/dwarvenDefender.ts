import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, eqStr, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const DWARVEN_DEFENDER: ClassSeed = {
  name: "Dwarven Defender",
  description: "A dwarven defender serves as a chosen protector of dwarven interests and strongholds.",
  hd: 12, levels: 10, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "good" },
  classSkills: ["Craft", "Listen", "Sense Motive", "Spot"],
  requirements: [
    gte("combat.bab", 7),
    eq("feats.dodge.possessed"),
    eq("feats.endurance.possessed"),
    eq("feats.toughness.possessed"),
    or(eqStr("identity.beliefs.alignment", "Lawful Good"), eqStr("identity.beliefs.alignment", "Lawful Neutral"), eqStr("identity.beliefs.alignment", "Lawful Evil")),
    eqStr("identity.physiology.race.name", "Dwarf"),
  ],
  classFeatureAptitude: "Dwarven Defender Class Feature",
  classFeatures: [
    [1, "AC Bonus (Dwarven Defender)"],
    [1, "Defensive Stance (Dwarven Defender)"],
    [1, "Weapon and Armor Proficiency (Dwarven Defender)"],
    [2, "Uncanny Dodge (Dwarven Defender)"],
    [3, "Defensive Stance (Dwarven Defender)"],
    [4, "Trap Sense (Dwarven Defender)"],
    [5, "Defensive Stance (Dwarven Defender)"],
    [6, "Damage Reduction (Dwarven Defender)"],
    [6, "Improved Uncanny Dodge (Dwarven Defender)"],
    [7, "Defensive Stance (Dwarven Defender)"],
    [8, "Mobile Defense (Dwarven Defender)"],
    [8, "Trap Sense (Dwarven Defender)"],
    [9, "Defensive Stance (Dwarven Defender)"],
    [10, "Damage Reduction (Dwarven Defender)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
