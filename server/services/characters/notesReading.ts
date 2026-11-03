/**
 * How a character's sheet reads its private notes for a reader its policy says reads them (`readsNotes`:
 * `CharactersPolicy.isPrivateNotesReader`, a campaign's `CampaignsPolicy.isPrivateNotesReader`): shown, or left out.
 */
export function toNotesReading(readsNotes: boolean) {
  return readsNotes ? ("show" as const) : ("hide" as const);
}
