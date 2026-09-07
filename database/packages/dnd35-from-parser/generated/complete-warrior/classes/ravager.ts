import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const RAVAGER: ClassSeed = {
  name: "Ravager",
  description: "A ravager is a devoted servant of a god of slaughter, dedicated wholly to spreading carnage and destruction in that deity's name.",
  hd: 10, levels: 10, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: ["Intimidate", "Knowledge (Religion)", "Move Silently", "Profession", "Ride"],
  requirements: [
    gte("combat.bab", 5),
    gte("skills.intimidate.rank", 3),
    gte("skills.knowledgereligion.rank", 3),
    gte("skills.survival.rank", 3),
    eq("feats.improvedsunder.possessed"),
    eq("feats.powerattack.possessed"),
  ],
  classFeatureAptitude: "Ravager Class Feature",
  classFeatures: [
    [1, "Weapon and Armor Proficiency (Ravager)"],
    [2, "Aura of Fear (Ravager)"],
    [3, "Cruelest Cut (Ravager)"],
    [5, "Aura of Fear (Ravager)"],
    [6, "Cruelest Cut (Ravager)"],
    [8, "Aura of Fear (Ravager)"],
    [9, "Cruelest Cut (Ravager)"],
    [10, "Visage of Terror (Ravager)"],
  ],
  freeFeats: [
    [1, "Pain Touch", "Ravager Class Feature"],
    [4, "Pain Touch", "Ravager Class Feature"],
    [7, "Pain Touch", "Ravager Class Feature"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
