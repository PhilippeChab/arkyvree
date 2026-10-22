import type { RulesWords } from "./queries.ts";

/**
 * The ruleset's word for an entity type (`words`, its rules': "Spell" for a 3.5 power, "Spells" with `many`), else the
 * type itself.
 */
export function entityTypeLabel(entityType: string, words: RulesWords | undefined, many = false): string {
  const word = words?.[entityType];
  if (!word) return entityType;
  return many ? word.many : word.one;
}

/**
 * The entity type an activity's type names `code` (`Klass` in `createKlass`, `KlassLevel` in `createKlassLevel`), by
 * its rules' words (`words`), if one does.
 */
export function entityTypeOfCode(code: string, words: RulesWords | undefined): string | undefined {
  return Object.entries(words ?? {}).find(
    ([, word]) => word && (word.code ?? word.one).replaceAll(" ", "") === code,
  )?.[0];
}

/**
 * The ruleset's words that replace the engine's names in an activity's type (`words`, its rules': "Create Klass" →
 * "Create Class", "Create Power" → "Create Spell").
 */
export function getActivityLabelOverrides(words: RulesWords | undefined): Record<string, string> {
  return Object.fromEntries(
    Object.entries(words ?? {}).flatMap(([, word]) => {
      if (!word) return [];
      const code = word.code ?? word.one;
      return code === word.one ? [] : [[code, word.one]];
    }),
  );
}
