import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, eqStr, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const BLADESINGER: ClassSeed = {
  name: "Bladesinger",
  description: "Bladesingers are elven warriors who seamlessly weave together artistry, sword technique, and arcane spellcasting into a unified fighting discipline.",
  hd: 8, levels: 10, skillPoints: 2,
  bab: "good",
  saves: { fortitude: "poor", reflex: "good", will: "good" },
  classSkills: ["Balance", "Concentration", "Jump", "Perform", "Spellcraft", "Tumble"],
  requirements: [
    gte("combat.bab", 5),
    gte("skills.balance.rank", 2),
    gte("skills.concentration.rank", 4),
    gte("skills.perform.rank", 2),
    gte("skills.tumble.rank", 2),
    eq("feats.combatcasting.possessed"),
    eq("feats.combatexpertise.possessed"),
    eq("feats.dodge.possessed"),
    or(eq("feats.weaponfocuslongsword.possessed"), eq("feats.weaponfocusrapier.possessed")),
    gte("spellcasting.arcane", 1),
    or(eqStr("identity.physiology.race.name", "Elf"), eqStr("identity.physiology.race.name", "Half-Elf")),
  ],
  casterLevelAdvancement: { type: "arcane", levels: [1, 3, 5, 7, 9] },
  classFeatureAptitude: "Bladesinger Class Feature",
  classFeatures: [
    [1, "Bladesong Style (Bladesinger)"],
    [1, "Spells per Day (Bladesinger)"],
    [1, "Weapon and Armor Proficiency (Bladesinger)"],
    [2, "Lesser Spellsong (Bladesinger)"],
    [4, "Song of Celerity (Bladesinger)"],
    [6, "Greater Spellsong (Bladesinger)"],
    [8, "Song of Celerity (Bladesinger)"],
    [10, "Song of Fury (Bladesinger)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
