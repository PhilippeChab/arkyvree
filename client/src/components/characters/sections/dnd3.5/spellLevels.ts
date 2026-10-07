/** A spell level's name, on the sheet and in the level wizard: "Cantrips" for level 0, else "Level 3". */
export function spellLevelName(level: number) {
  return level === 0 ? "Cantrips" : `Level ${level}`;
}
