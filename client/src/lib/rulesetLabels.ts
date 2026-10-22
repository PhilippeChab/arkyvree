import { getActivityName } from "@/shared/activity.ts";

import type { RulesWords } from "./queries.ts";

/**
 * The ruleset's word for an entity type (`words`, its rules': "Spell" for a 3.5 power, "Spells" with `many`), else a
 * generic one ("Entity"): never the type as the code names it.
 */
export function entityTypeLabel(entityType: string, words: RulesWords | undefined, many = false): string {
  const word = words?.[entityType];
  if (!word) return many ? "Entities" : "Entity";
  return many ? word.many : word.one;
}

/**
 * The entity type an activity's type names by its activity name (`name`: `Klass` in `createKlass`, `KlassLevel` in
 * `createKlassLevel`), among the types its rules have words for (`words`), if one does.
 */
export function entityTypeOfActivityName(name: string, words: RulesWords | undefined): string | undefined {
  return Object.keys(words ?? {}).find((entityType) => getActivityName(entityType) === name);
}

/** A count in a word its rules give (`word`: "1 level", "3 levels"), lowercase, as a sentence reads it. */
export function formatWordCount(count: number, word: { many: string; one: string }): string {
  return `${count} ${(count === 1 ? word.one : word.many).toLowerCase()}`;
}

/**
 * The ruleset's words that replace the activity names of its types in an activity's type, as a label spells them
 * (`words`, its rules': "Create Klass" → "Create Class", "Create Power" → "Create Spell").
 */
export function getActivityLabelOverrides(words: RulesWords | undefined): Record<string, string> {
  return Object.fromEntries(
    Object.entries(words ?? {}).flatMap(([entityType, word]) => {
      if (!word) return [];
      const spelled = getActivityName(entityType).replace(/(?<=[a-z])(?=[A-Z])/g, " ");
      return spelled === word.one ? [] : [[spelled, word.one]];
    }),
  );
}
