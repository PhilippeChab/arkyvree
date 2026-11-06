/** What every Pathfinder 1 entry's page gives, whatever its kind: the books it's printed in, its labelled texts, its tables. */

/** A labelled text of a page: a feat's Benefit, a class feature, a racial trait, its paragraphs joined by a space. */
export interface LabeledText {
  label: string;
  text: string;
}

/** A table as its page prints it: its columns' headers (a group's name before its own: "Spells Per Day 1st"), its rows' cells. */
export interface PageTable {
  columns: string[];
  rows: string[][];
}

/** A book an entry is printed in, as its page's Source line names it, and the page it's on. */
export interface Printing {
  book: string;
  page?: number;
}
