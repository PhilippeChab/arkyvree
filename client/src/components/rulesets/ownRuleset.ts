import type { RulesetListItem } from "@/client/src/lib/queries.ts";

/**
 * The ruleset a new character's dialog starts on, from the first of the user's own rulesets to play (`forks`: every
 * ruleset of theirs is a fork, those published as an extension aside, as the server filters them): the one they own
 * when it's alone. None when they own none (the base rules are read-only templates, which the dialog warns of) or
 * several, where any pick would be a guess: the server is asked for two, which tells one from more.
 */
export function findOwnRuleset(forks: RulesetListItem[]): RulesetListItem | undefined {
  return forks.length === 1 ? forks[0] : undefined;
}
