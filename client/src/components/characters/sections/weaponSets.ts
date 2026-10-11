/** A weapon set as the user sees it: stored from 0, shown from 1 ("Set 1"), as on the sheet and the PDF. */
export function shownWeaponSet(stored: number) {
  return stored + 1;
}
