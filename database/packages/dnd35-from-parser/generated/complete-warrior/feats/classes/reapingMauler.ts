import type { FeatSeed } from "@/database/packages/dnd35/v1/feats/types.ts";

const APT = "Reaping Mauler Class Feature";

export const REAPING_MAULER_FEATS: FeatSeed[] = [
  { name: "Adept Wrestling (Reaping Mauler)", description: "Starting at 2nd level, a reaping mauler wearing light or no armor receives a +1 bonus on grapple checks and opposed Strength or Dexterity checks. At 4th level, this bonus improves to +2.", stackable: true, selectable: false, aptitudes: [APT], modifiers: [{ target: "combat.grapple.misc", operator: "add", value: "1", valueType: "number" }] },
  { name: "Counter Grapple (Reaping Mauler)", description: "At 3rd level and beyond, while grappled or pinned and wearing light or no armor, a reaping mauler may attempt a grapple check or an Escape Artist check (opposed by the foe's grapple check) to break free as usual. If the chosen check fails, he may immediately try the other check as a free action.", selectable: false, aptitudes: [APT] },
  { name: "Devastating Grapple (Reaping Mauler)", description: "At 5th level, if a reaping mauler pins an opponent while grappling and sustains the pin for 3 consecutive rounds, the pinned creature must succeed on a Fortitude save (DC 10 + the reaping mauler's class level + his Wisdom modifier) at the end of the third round or be slain. Creatures lacking discernible anatomy are immune to this effect.", selectable: false, aptitudes: [APT] },
  { name: "Sleeper Lock (Reaping Mauler)", description: "At 3rd level, a reaping mauler gains the ability to knock an opponent unconscious through sustained pressure. If he pins a foe while grappling and holds the pin for 1 full round, the pinned creature must succeed on a Fortitude save (DC 10 + the reaping mauler's class level + his Wisdom modifier) at the end of that round or be knocked unconscious for 1d3 rounds. Creatures lacking discernible anatomy are immune to this effect.", selectable: false, aptitudes: [APT] },
  { name: "Weapon and Armor Proficiency (Reaping Mauler)", description: "This prestige class does not grant proficiency with any weapons or armor.", selectable: false, aptitudes: [APT] },
];
