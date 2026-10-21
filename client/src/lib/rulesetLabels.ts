import type { RulesWords } from "./queries.ts";

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

/**
 * The ruleset's word for an entity type (`words`, its rules': "Spell" for a 3.5 power, "Spells" with `many`), else the
 * engine's, else the type itself.
 */
export function entityTypeLabel(entityType: string, words: RulesWords | undefined, many = false): string {
  const word = words?.[entityType] ?? ENTITY_WORDS[entityType];
  if (!word) return entityType;
  return many ? word.many : word.one;
}

/**
 * The entity type the engine's names spell `code` (`Klass` in `createKlass`, `KlassLevel` in `createKlassLevel`), if
 * one does.
 */
export function entityTypeOfCode(code: string): string | undefined {
  return Object.entries(ENTITY_WORDS).find(([, words]) => (words.code ?? words.one).replaceAll(" ", "") === code)?.[0];
}

/**
 * The ruleset's words that replace the engine's names in an activity's type: the app's own ("Create Klass" → "Create
 * Class"), and its rules' (`words`: "Create Power" → "Create Spell").
 */
export function getActivityLabelOverrides(words: RulesWords | undefined): Record<string, string> {
  return Object.fromEntries(
    Object.entries(ENTITY_WORDS).flatMap(([entityType, engine]) => {
      const code = engine.code ?? engine.one;
      const word = entityTypeLabel(entityType, words);
      return code === word ? [] : [[code, word]];
    }),
  );
}
