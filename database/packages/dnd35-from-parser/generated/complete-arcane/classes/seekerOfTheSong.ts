import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const SEEKER_OF_THE_SONG: ClassSeed = {
  name: "Seeker of the Song",
  description: "Seekers of the song wield the power of music in ways that amaze even the most skilled bards.",
  hd: 6, levels: 10, skillPoints: 4,
  bab: "poor",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
  classSkills: [
    "Climb",
    "Concentration",
    "Craft",
    "Diplomacy",
    "Jump",
    "Knowledge (Arcana)",
    "Listen",
    "Perform",
    "Profession",
    "Ride",
    "Sense Motive",
    "Spot",
    "Swim",
  ],
  requirements: [
    gte("skills.knowledgearcana.rank", 13),
    gte("skills.perform.rank", 13),
    eq("feats.skillfocus.*.possessed"),
  ],
  classFeatureAptitude: "Seeker of the Song Class Feature",
  classFeatures: [
    [1, "Rapture of the Song (Seeker of the Song)"],
    [1, "Seeker Music (Seeker of the Song)"],
    [1, "Weapon and Armor Proficiency (Seeker of the Song)"],
    [2, "Combine Songs (Seeker of the Song)"],
    [4, "Rapture of the Song (Seeker of the Song)"],
    [5, "Subvocalize (Seeker of the Song)"],
    [7, "Rapture of the Song (Seeker of the Song)"],
    [10, "Rapture of the Song (Freedom of Movement) (Seeker of the Song)"],
    [10, "Rapture of the Song (Seeker of the Song)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
