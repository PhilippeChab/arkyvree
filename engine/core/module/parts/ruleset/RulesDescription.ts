/**
 * What a base rules' rulesets share, past any ruleset's view: what the app calls their entities, the kinds a race or a
 * class is for, a class's last level, a power's levels, and the license a system ruleset's content is under. The
 * client reads it once, for every base rules, and holds none of it.
 */
export interface RulesDescription {
  /** The kinds a race or a class is for: a player character (`pc`), and those its rules add (3.5's bonded creatures) */
  entityKinds: { label: string; value: string }[];
  /** A class's last level */
  lastClassLevel: number;
  /**
   * What a system ruleset's content is licensed under, under its header (`text`: the license whose text the app
   * serves): none where nothing needs saying
   */
  license?: { notice: string; text: "ogl" };
  /** The levels a power has, each with its name ("Cantrips", "Level 1") */
  powerLevels: { label: string; level: number }[];
  /** Its words for the entity types whose word isn't the engine's, by type: 3.5's powers are spells */
  words: Partial<Record<string, RulesWord>>;
}

/** A word in its singular and its plural ("Spell", "Spells"). */
export interface RulesWord {
  many: string;
  one: string;
}
