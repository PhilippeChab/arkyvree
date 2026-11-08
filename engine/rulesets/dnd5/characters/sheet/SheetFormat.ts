import type { SheetColumn, SheetRow, SheetScore } from "@/engine/core/module/index.ts";
import { formatSigned } from "@/shared/text.ts";

/** How the printed sheet writes a block's figures. */
export default class SheetFormat {
  /** A table's cell (`row`'s, under `column`), as its block writes it: a dash for none, unless its column shows none. */
  static cellOf(row: Pick<SheetRow, "cells">, column: SheetColumn) {
    return row.cells[column.key] || (column.noDash ? "" : "—");
  }

  /** A score's value, as its block writes it: with its sign when it's `signed` (a saving throw's), else as it is. */
  static valueOf({ signed, value }: Pick<SheetScore, "signed" | "value">) {
    return signed ? formatSigned(value) : String(value);
  }
}
