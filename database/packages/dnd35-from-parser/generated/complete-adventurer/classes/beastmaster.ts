import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eq, gte } from "@/database/packages/dnd35/v1/feats/types.ts";

export const BEASTMASTER: ClassSeed = {
  name: "Beastmaster",
  description: "A beastmaster feels more at home among the animals of nature than fellow sentient beings. Over time, these wanderers befriend a wide variety of animals, from mighty dire lions to tiny weasels. Eventually, a beastmaster takes on aspects of her animal companions, becoming almost as much animal as humanoid. Druids and rangers are the most common beastmasters, thanks to those characters' natural link with the animal world. Some barbarians, ?ghters, or scouts also become beastmasters, particularly those with a strong af?nity for nature (such as elves or hal?ings). Characters of other classes rarely pursue this path. NPC beastmasters are typically loners, relying on their animal companions for friendship on their travels. Good-aligned beastmasters might use their powers to right injustices, even allying themselves with rural villages for a time. Evil-aligned beastmasters are often openly hostile to civilization, becoming reclusive xenophobes.",
  hd: 10, levels: 10, skillPoints: 4,
  bab: "good",
  saves: { fortitude: "good", reflex: "good", will: "poor" },
  classSkills: [
    "Climb",
    "Handle Animal",
    "Heal",
    "Hide",
    "Jump",
    "Knowledge (Nature)",
    "Listen",
    "Ride",
    "Spot",
    "Survival",
    "Swim",
  ],
  requirements: [
    gte("skills.handleanimal.rank", 8),
    gte("skills.survival.rank", 4),
    eq("feats.skillfocushandleanimal.possessed"),
  ],
  classFeatureAptitude: "Beastmaster Class Feature",
  classFeatures: [
    [1, "Animal Companion (Beastmaster)"],
    [1, "Weapon and Armor Proficiency (Beastmaster)"],
    [1, "Wild Empathy (Beastmaster)"],
    [3, "Speak With Animals (Beastmaster)"],
    [4, "Extra Animal Companion (Beastmaster)"],
    [5, "Low-light Vision (Beastmaster)"],
    [6, "Speak With Animals (Beastmaster)"],
    [7, "Extra Animal Companion (Beastmaster)"],
    [9, "Speak With Animals (Beastmaster)"],
    [10, "Extra Animal Companion (Beastmaster)"],
  ],
  freeFeats: [
    [2, "Alertness", "Beastmaster Class Feature"],
    [8, "Scent", "Beastmaster Class Feature"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
