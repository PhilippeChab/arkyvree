interface Words {
  /** How the engine's names spell it (`createKlass`), where that isn't `one` */
  code?: string;
  many: string;
  one: string;
}

/** The engine's word for each entity type, which a ruleset can rename. */
const ENTITY_WORDS: Record<string, Words> = {
  abilities: { one: "Ability", many: "Abilities" },
  aptitudes: { one: "Aptitude", many: "Aptitudes" },
  feats: { one: "Feat", many: "Feats" },
  items: { one: "Item", many: "Items" },
  klass_levels: { one: "Class Level", many: "Class Levels", code: "Klass Level" },
  klasses: { one: "Class", many: "Classes", code: "Klass" },
  languages: { one: "Language", many: "Languages" },
  mechanics: { one: "Mechanic", many: "Mechanics" },
  modifiers: { one: "Modifier", many: "Modifiers" },
  powers: { one: "Power", many: "Powers" },
  races: { one: "Race", many: "Races" },
  saves: { one: "Save", many: "Saves" },
  skills: { one: "Skill", many: "Skills" },
};

/** What a ruleset calls an entity type where its word isn't the engine's, by its base rules: 3.5's powers are spells. */
const RULESET_WORDS: Record<string, Record<string, Words>> = {
  "Dungeons & Dragons: 3.5": {
    powers: { one: "Spell", many: "Spells" },
  },
};

/** The ruleset's word for an entity type ("Spell" for a 3.5 power, "Spells" with `many`), else the type itself. */
export function entityTypeLabel(entityType: string, baseRules: string | undefined, many = false): string {
  const words = RULESET_WORDS[baseRules ?? ""]?.[entityType] ?? ENTITY_WORDS[entityType];
  if (!words) return entityType;
  return many ? words.many : words.one;
}

/**
 * The ruleset's words that replace the engine's names in an activity's type: the app's own ("Create Klass" → "Create
 * Class"), and its base rules' ("Create Power" → "Create Spell").
 */
export function getActivityLabelOverrides(baseRules: string | undefined): Record<string, string> {
  return Object.fromEntries(
    Object.entries(ENTITY_WORDS).flatMap(([entityType, words]) => {
      const code = words.code ?? words.one;
      const word = entityTypeLabel(entityType, baseRules);
      return code === word ? [] : [[code, word]];
    }),
  );
}
