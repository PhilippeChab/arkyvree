/**
 * A character's bounds the server holds its row to, wherever its values come from: a form's body (the routes'), or a
 * file another program saved (an import's, which brings its values within them).
 */

/** The longest name a character takes. */
export const MAX_CHARACTER_NAME_LENGTH = 255;

/** The longest file an import reads, in characters: a PCGen character's runs to tens of thousands. */
export const MAX_IMPORT_FILE_LENGTH = 1_000_000;

/** The most of an item one entry of a character's inventory holds: its quantity's column is a Postgres integer. */
export const MAX_ITEM_QUANTITY = 2_147_483_647;
