/** What the app exports: a character's sheet as a PDF, the server's queued export and a shared sheet's download alike. */

/** The most of the character's name a sheet's file name keeps, in characters (code points, never half of one). */
const FILE_NAME_LENGTH = 200;

/** What a file name can't hold, on any system the file is saved to. */
const FILE_NAME_RESERVED = /[/\\?%*:|"<>]/g;

/** A sheet's file name: the character's name ("character" when it has none), what a file name can't hold replaced. */
export function formatSheetFileName(characterName: string) {
  const name = Array.from((characterName || "character").replace(FILE_NAME_RESERVED, "_"));
  return `${name.slice(0, FILE_NAME_LENGTH).join("")}-sheet.pdf`;
}
