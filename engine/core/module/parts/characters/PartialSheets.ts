import type { FieldsBlock, SheetField } from "./blocks.ts";
import type { CharacterColumns, PartialReading, PartialSheet, SheetSummary } from "./descriptions.ts";

/**
 * A character as a campaign member who reads it partly reads it, whatever its ruleset answers: an allowlist, each part
 * built from the keys its shape declares, so nothing a ruleset adds reaches such a reader. Its row's columns, no
 * requirements nor modifiers, a valid validation, its summary's separator and words with no tracks, and its identity's
 * `fields` block alone: its head, and its lines of fields and those under them, each field its declared keys, without
 * its picked links or its notes. Which fields that block holds and what they say are its ruleset's: who a partly seen
 * character of its game is and what it looks like (3.5's race and physical traits).
 */
export default class PartialSheets {
  /** A field of a partly seen character's identity, by its kind: its declared keys alone, in their order. */
  private static fieldOf(field: SheetField): SheetField {
    const { key, label } = field;
    switch (field.kind) {
      case "number":
        return {
          key,
          kind: field.kind,
          label,
          min: field.min,
          ...(field.required !== undefined && { required: field.required }),
          value: field.value,
        };
      case "select":
        return { key, kind: field.kind, label, options: [...field.options], value: field.value };
      case "text":
        return {
          key,
          kind: field.kind,
          label,
          value: field.value,
          ...(field.fixed !== undefined && { fixed: field.fixed }),
        };
      case "textarea":
        return { key, kind: field.kind, label, placeholder: field.placeholder, value: field.value };
    }
  }

  /**
   * A partly seen character's identity's block (`block`, as its ruleset describes it): its head, its lines of fields
   * and those under them, without its picked links nor its notes.
   */
  private static identityOf(block: FieldsBlock): FieldsBlock {
    return {
      kind: "fields",
      key: block.key,
      title: block.title,
      empty: block.empty,
      ...(block.portrait !== undefined && { portrait: block.portrait }),
      saved: block.saved,
      failed: block.failed,
      lines: block.lines.map((line) => line.map((field) => PartialSheets.fieldOf(field))),
      fields: block.fields.map((field) => PartialSheets.fieldOf(field)),
    };
  }

  /** A partly seen character's summary (`summary`, as its ruleset describes it): its separator and words, no tracks. */
  private static summaryOf({ separator, words }: SheetSummary): SheetSummary {
    return {
      separator,
      words: {
        add: words.add,
        removeLast: words.removeLast,
        removeLastMessage: words.removeLastMessage,
        deleteMessage: words.deleteMessage,
        removed: words.removed,
        removeFailed: words.removeFailed,
      },
      tracks: [],
    };
  }

  /** The partial sheet of a character of `columns`, of what its ruleset describes of it (`reading`). */
  static describe(columns: CharacterColumns, reading: PartialReading): PartialSheet {
    return {
      ...columns,
      requirements: {},
      modifiers: {},
      validation: { valid: true, issues: [] },
      summary: PartialSheets.summaryOf(reading.summary),
      blocks: [PartialSheets.identityOf(reading.identity)],
    };
  }
}
