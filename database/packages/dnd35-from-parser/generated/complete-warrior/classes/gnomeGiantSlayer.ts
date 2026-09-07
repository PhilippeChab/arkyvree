import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, eqStr, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const GNOME_GIANT_SLAYER: ClassSeed = {
  name: "Gnome Giant-slayer",
  description: "A gnome giant-slayer combines nimbleness, martial skill, and cunning tactics to overcome larger opponents.",
  hd: 10, levels: 10, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "poor" },
  classSkills: [
    "Climb",
    "Craft",
    "Escape Artist",
    "Hide",
    "Intimidate",
    "Jump",
    "Move Silently",
    "Tumble",
    "Use Rope",
  ],
  requirements: [
    gte("skills.escapeartist.rank", 3),
    gte("skills.tumble.rank", 3),
    eq("feats.dodge.possessed"),
    eq("feats.mobility.possessed"),
    eq("feats.springattack.possessed"),
    eqStr("identity.physiology.race.name", "Gnome"),
  ],
  classFeatureAptitude: "Gnome Giant-slayer Class Feature",
  classFeatures: [
    [1, "Favored Enemy (Giant) (Gnome Giant-slayer)"],
    [1, "Weapon and Armor Proficiency (Gnome Giant-slayer)"],
    [2, "Crafty Fighter (Gnome Giant-slayer)"],
    [3, "Slippery (Gnome Giant-slayer)"],
    [4, "Favored Enemy (Giant) (Gnome Giant-slayer)"],
    [5, "Close Shot (Gnome Giant-slayer)"],
    [6, "Fast Movement (Gnome Giant-slayer)"],
    [7, "Favored Enemy (Giant) (Gnome Giant-slayer)"],
    [8, "Improved Mobility (Gnome Giant-slayer)"],
    [9, "Annoying Strike (Gnome Giant-slayer)"],
    [10, "Defensive Roll (Gnome Giant-slayer)"],
    [10, "Favored Enemy (Giant) (Gnome Giant-slayer)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
