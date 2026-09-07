import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, eqStr, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const ARCANE_ARCHER: ClassSeed = {
  name: "Arcane Archer",
  description: "The arcane archer combines martial archery expertise with arcane magical ability, weaving spells into her ranged combat techniques.",
  hd: 8, levels: 10, skillPoints: 4,
  bab: "good",
  saves: { fortitude: "good", reflex: "good", will: "poor" },
  classSkills: ["Craft", "Hide", "Listen", "Move Silently", "Ride", "Spot", "Survival", "Use Rope"],
  requirements: [
    gte("combat.bab", 6),
    eq("feats.pointblankshot.possessed"),
    eq("feats.preciseshot.possessed"),
    or(eq("feats.weaponfocuslongbow.possessed"), eq("feats.weaponfocusshortbow.possessed")),
    gte("spellcasting.arcane", 1),
    eqStr("identity.physiology.race.name", "Elf"),
  ],
  classFeatureAptitude: "Arcane Archer Class Feature",
  classFeatures: [
    [1, "Enhance Arrow (Arcane Archer)"],
    [1, "Weapon and Armor Proficiency (Arcane Archer)"],
    [2, "Imbue Arrow (Arcane Archer)"],
    [3, "Enhance Arrow (Arcane Archer)"],
    [4, "Seeker Arrow (Arcane Archer)"],
    [5, "Enhance Arrow (Arcane Archer)"],
    [6, "Phase Arrow (Arcane Archer)"],
    [7, "Enhance Arrow (Arcane Archer)"],
    [8, "Hail of Arrows (Arcane Archer)"],
    [9, "Enhance Arrow (Arcane Archer)"],
    [10, "Arrow of Death (Arcane Archer)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
