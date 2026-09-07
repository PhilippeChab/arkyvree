import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";
import { eqStr, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export const ANIMAL_LORD: ClassSeed = {
  name: "Animal Lord",
  description: "Each animal lord forms a bond with one group of animals. Apelords, bearlords, birdlords, catlords, horselords, sharklords, snakelords, and wol?ords all exist. Animals in his selected group accept an animal lord as a kindred soul and a leader. They offer him their support, and he watches over them in turn. Barbarians, rangers, and druids are the most likely characters to adopt this class. Barbarians prefer the more physically powerful options, including apelord, bearlord, and horselord. Rangers gravitate toward the stealthier selections, such as catlord and wol?ord. Most birdlords are druids with the ability to use wild shape, but druids are equally likely to select any type of animal to bond with. Some scouts, rogues, and even rare monks ?nd this path rewarding as well. Among the races, elves and half-elves are the most common examples of animal lords due to their close bond to nature. A character can choose this prestige class more than once but must select a different group of associated animals and start at 1st level each time. Levels of different animal lord classes do not stack when determining level-based class features.",
  hd: 10, levels: 10, skillPoints: 4,
  bab: "good",
  saves: { fortitude: "good", reflex: "good", will: "poor" },
  classSkills: [
    "Climb",
    "Escape Artist",
    "Handle Animal",
    "Intimidate",
    "Jump",
    "Knowledge (Nature)",
    "Listen",
    "Move Silently",
    "Spot",
    "Survival",
    "Swim",
  ],
  requirements: [
    gte("combat.bab", 5),
    gte("skills.handleanimal.rank", 4),
    gte("skills.knowledgenature.rank", 2),
    or(
      eqStr("identity.beliefs.alignment", "Neutral Good"),
      eqStr("identity.beliefs.alignment", "Lawful Neutral"),
      eqStr("identity.beliefs.alignment", "True Neutral"),
      eqStr("identity.beliefs.alignment", "Chaotic Neutral"),
      eqStr("identity.beliefs.alignment", "Neutral Evil"),
    ),
  ],
  classFeatureAptitude: "Animal Lord Class Feature",
  classFeatures: [
    [1, "Animal Bond (Animal Lord)"],
    [1, "Detect Animals (Animal Lord)"],
    [1, "Weapon and Armor Proficiency (Animal Lord)"],
    [1, "Wild Empathy (Animal Lord)"],
    [2, "First Totem (Animal Lord)"],
    [2, "Low-light Vision (Animal Lord)"],
    [3, "Wild Aspect (Animal Lord)"],
    [4, "Speak With Animals (Animal Lord)"],
    [5, "Summon Animal (Animal Lord)"],
    [6, "Second Totem (Animal Lord)"],
    [6, "Wild Aspect (Animal Lord)"],
    [7, "Animal Growth (Animal Lord)"],
    [8, "Animal Telepathy (Animal Lord)"],
    [9, "Wild Aspect (Animal Lord)"],
    [10, "Third Totem (Animal Lord)"],
  ],
};

// TODO: No modifiers defined — review if this class needs any
