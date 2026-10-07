/** What's left to review in a class, which opens its generated file. */

import type { ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";

/**
 * What's left to review in a class: what the generator couldn't resolve, unless the overrides name the key (even
 * empty: reviewed).
 */
export function getClassReviewNotes(ref: ClassReference): string[] {
  const { detected } = ref;
  const overrides = ref.overrides ?? {};
  const todos: string[] = [];
  if (!("requirements" in overrides) && detected.unresolvedPrereqs?.length) {
    for (const p of detected.unresolvedPrereqs) todos.push(p);
  }
  if (!("aptitudePicks" in overrides) && detected.unresolvedAptitudePicks?.length) {
    for (const a of detected.unresolvedAptitudePicks) todos.push(`Unresolved aptitude pick: "${a}"`);
  }
  if (!("modifiers" in overrides) && !("columns" in overrides)) {
    todos.push("No modifiers defined — review if this class needs any");
  }
  return todos;
}
