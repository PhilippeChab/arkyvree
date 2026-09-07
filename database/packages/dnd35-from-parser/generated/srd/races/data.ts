import type { RaceDefinition } from "@/database/packages/dnd35/v1/races/types.ts";

export const ALL_RACES: RaceDefinition[] = [
  {
    name: "Dwarf",
    description: "Dwarves are known for their skill in warfare, their ability to withstand physical and magical punishment, their hard work, and their capacity for drinking ale. Dwarves are slow but steady, and they hate to retreat. They have darkvision, can move normally in heavy armor, and gain racial bonuses to saving throws, hit points, weapon proficiencies with axes and hammers, and crafting.",
    size: "Medium",
    baseSpeed: 20,
    modifiers: [
      { target: "abilities.constitution.misc", operator: "add", value: "2", valueType: "number" },
      { target: "abilities.charisma.misc", operator: "add", value: "-2", valueType: "number" },
    ],
  },
  {
    name: "Elf",
    description: "Elves are known for their poetry, song, and magical arts. They are slow to make friends and enemies, but once they do, these relationships last for generations. They are immune to sleep effects and gain racial bonuses to saving throws against enchantment spells, as well as racial bonuses to perception and fine manipulation tasks.",
    size: "Medium",
    baseSpeed: 30,
    modifiers: [
      { target: "abilities.dexterity.misc", operator: "add", value: "2", valueType: "number" },
      { target: "abilities.constitution.misc", operator: "add", value: "-2", valueType: "number" },
      { target: "skills.listen.misc", operator: "add", value: "2", valueType: "number" },
      { target: "skills.search.misc", operator: "add", value: "2", valueType: "number" },
      { target: "skills.spot.misc", operator: "add", value: "2", valueType: "number" },
    ],
  },
  {
    name: "Gnome",
    description: "Gnomes are known for their humor and engineering. Though gnomes generally get along with dwarves, they have much in common with elves, especially their love of nature and dislike of goblins and giants. Gnomes have low-light vision and gain racial bonuses to saving throws against illusions, weapon proficiencies with gnome-sized weapons, and skill checks for listening.",
    size: "Small",
    baseSpeed: 20,
    modifiers: [
      { target: "abilities.strength.misc", operator: "add", value: "-2", valueType: "number" },
      { target: "abilities.constitution.misc", operator: "add", value: "2", valueType: "number" },
      { target: "skills.listen.misc", operator: "add", value: "2", valueType: "number" },
    ],
  },
  {
    name: "Half-Elf",
    description: "Half-elves have both human and elven ancestry, and share the curiosity, inventiveness, and ambition of their human ancestors and the refined senses, love of nature, and artistic tastes of their elven ancestors. They have low-light vision, immunity to sleep effects, and racial bonuses to saving throws against enchantment spells.",
    size: "Medium",
    baseSpeed: 30,
    modifiers: [
      { target: "skills.listen.misc", operator: "add", value: "1", valueType: "number" },
      { target: "skills.search.misc", operator: "add", value: "1", valueType: "number" },
      { target: "skills.spot.misc", operator: "add", value: "1", valueType: "number" },
      { target: "skills.diplomacy.misc", operator: "add", value: "2", valueType: "number" },
      { target: "skills.gatherinformation.misc", operator: "add", value: "2", valueType: "number" },
    ],
  },
  {
    name: "Half-Orc",
    description: "Half-orcs are the result of a union between humans and orcs. They inherit the strength and durability of their orc ancestors, but are often shunned by human and orc society alike. Half-orcs have darkvision and a racial bonus to strength.",
    size: "Medium",
    baseSpeed: 30,
    modifiers: [
      { target: "abilities.strength.misc", operator: "add", value: "2", valueType: "number" },
      { target: "abilities.intelligence.misc", operator: "add", value: "-2", valueType: "number" },
      { target: "abilities.charisma.misc", operator: "add", value: "-2", valueType: "number" },
    ],
  },
  {
    name: "Halfling",
    description: "Halflings are clever, capable, and resourceful survivors. They are practical and down-to-earth, and often excel as opportunists and professionals. Halflings have good reflexes and coordination, and gain racial bonuses to saving throws for Fortitude and Will, skill checks for climbing, jumping, and moving silently, weapon proficiencies with thrown weapons and slings, and Armor Class.",
    size: "Small",
    baseSpeed: 20,
    modifiers: [
      { target: "abilities.strength.misc", operator: "add", value: "-2", valueType: "number" },
      { target: "abilities.dexterity.misc", operator: "add", value: "2", valueType: "number" },
      { target: "skills.climb.misc", operator: "add", value: "2", valueType: "number" },
      { target: "skills.jump.misc", operator: "add", value: "2", valueType: "number" },
      { target: "skills.movesilently.misc", operator: "add", value: "2", valueType: "number" },
      { target: "skills.listen.misc", operator: "add", value: "2", valueType: "number" },
      { target: "saves.fortitude.misc", operator: "add", value: "1", valueType: "number" },
      { target: "saves.reflex.misc", operator: "add", value: "1", valueType: "number" },
      { target: "saves.will.misc", operator: "add", value: "1", valueType: "number" },
    ],
  },
  {
    name: "Human",
    description: "Humans are the most adaptable of the common races. They are quick to learn and possess great ingenuity. Humans have no special bonuses or penalties due to their race. They can choose any class, and they gain an extra feat at first level and an extra skill point at each level.",
    size: "Medium",
    baseSpeed: 30,
    modifiers: [
      { target: "aptitudes.general.allowed", operator: "add", value: "1", valueType: "number" },
      { target: "skills.budget.perlevel", operator: "add", value: "1", valueType: "number" },
    ],
  },
];
