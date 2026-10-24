/**
 * An inventory group (3.5's weapon set) as the user sees it: stored from 0, shown from 1 ("Set 1"), as on the sheet.
 */
export function shownGroup(stored: number) {
  return stored + 1;
}

/** Groups as the server stores them, from 0, from those the user sees, from 1. */
export function storedGroups(shown: number[]) {
  return shown.map((group) => group - 1);
}
