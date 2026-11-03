import { InputBase } from "@mui/material";
import { type ClipboardEvent, type KeyboardEvent, useState } from "react";

import { DataCell, DataRow, DataTable, ValueChip } from "@/client/src/components/common/index.ts";
import type { PositionWord } from "@/client/src/lib/rulesetLabels.ts";

import { CHANGED_TEXT_SX } from "./changedCell.ts";
import { parseTableCell, type PlacedCell, placeTable, type TableCell, type TableRules } from "./tablePaste.ts";

interface TableGridProps {
  /** A cell whose column's every value an earlier owned entity has: it shows All, and takes nothing */
  allAbove: (ownedId: string, column: number) => boolean;
  /** A cell's value as the draft holds it, typed or saved: a typed value is written when it differs from it */
  edited: (ownedId: string, column: number) => TableCell;
  /** Cells a typed value or a paste writes */
  onCells: (cells: PlacedCell[]) => void;
  /** A block was pasted into a cell under an earlier All, which takes nothing */
  onLockedPaste: () => void;
  ownedEntities: readonly { id: string; position: number }[];
  /**
   * Its rules' word for an owned entity's position along its owner, which names one ("Level 3"), and several ("Levels")
   */
  positionWord: PositionWord;
  readOnly: boolean;
  /** A cell's value as saved: a changed cell is marked against it */
  saved: (ownedId: string, column: number) => TableCell;
  /** The table as its rules describe it: its label, its columns (3.5's spell levels), its word for every value */
  table: TableRules;
  /** A cell's value as the tab holds it */
  value: (ownedId: string, column: number) => TableCell;
}

/** The id of a cell's input, which Enter moves down a column by. */
function cellId(label: string, row: number, column: number) {
  return `${label.replaceAll(" ", "-").toLowerCase()}-${row}-${column}`;
}

/** A cell of a table as its input shows it: empty for none, the table's word for every value of its column ("All"). */
function displayCell(table: TableRules, cell: TableCell) {
  if (cell === null) return "";
  return cell === "all" ? (table.all?.word ?? "") : String(cell);
}

/**
 * An owner's table as the book prints it (3.5's spells per day or spells known), a row an owned entity, a column each
 * of its columns (a spell level), its totals edited in place: a typed cell writes as it's left (Enter moves down its
 * column; what it can't read leaves it as it was), a block pasted into a cell fills from there (rows naming their
 * position land on it), and a changed cell is marked until the tab's save.
 */
export function TableGrid({
  allAbove,
  edited,
  ownedEntities,
  onCells,
  onLockedPaste,
  positionWord,
  readOnly,
  saved,
  table,
  value,
}: TableGridProps) {
  const { label } = table;
  // The cell being typed in, and its text, until it's left
  const [typing, setTyping] = useState<{ column: number; ownedId: string; text: string } | null>(null);

  const commit = (ownedId: string, column: number, text: string) => {
    setTyping(null);
    const cell = parseTableCell(text, table);
    // What was typed, though the cell shows it already (a 0 its rules fill in): it holds once what fills it goes
    if (cell !== undefined && cell !== edited(ownedId, column)) onCells([{ ownedId, column, value: cell }]);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>, row: number, column: number) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const next = Math.min(ownedEntities.length - 1, Math.max(0, row + (event.shiftKey ? -1 : 1)));
    event.currentTarget.blur();
    document.getElementById(cellId(label, next, column))?.focus();
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>, row: number, column: number) => {
    // A block, or a row's cells (a PDF's, by spaces), fills from the cell; a value alone is the cell's own text
    const text = event.clipboardData.getData("text/plain");
    if (readOnly || !/[\s,;|]/.test(text.trim())) return;
    if (allAbove(ownedEntities[row]?.id ?? "", column)) {
      event.preventDefault();
      onLockedPaste();
      return;
    }
    event.preventDefault();
    // The paste is the cell's value now, not what was typed before it
    setTyping(null);
    // From the column its header names, else the cell's
    onCells(placeTable(text, table, ownedEntities, row, column));
  };

  return (
    <DataTable
      framed
      size="small"
      minWidth={640}
      columns={[
        { key: "position", label: positionWord.one, width: "9%" },
        ...table.columns.map((column) => ({ key: column.key, label: column.label, align: "center" as const })),
      ]}
    >
      {ownedEntities.map(({ id, position }, row) => (
        <DataRow key={id}>
          <DataCell slot="primary">
            <ValueChip label={position} color="primary" />
          </DataCell>
          {table.columns.map((header, column) => {
            const cell = value(id, column);
            const before = saved(id, column);
            const changed = cell !== before;
            const name = header.label;
            return (
              <DataCell
                key={column}
                slot="labeled"
                label={name}
                align="center"
                sx={[changed && { bgcolor: "action.selected" }]}
              >
                <InputBase
                  id={cellId(label, row, column)}
                  value={typing?.ownedId === id && typing.column === column ? typing.text : displayCell(table, cell)}
                  readOnly={readOnly || allAbove(id, column)}
                  onChange={(e) => setTyping({ ownedId: id, column, text: e.target.value })}
                  title={
                    allAbove(id, column)
                      ? table.all?.hint
                      : changed
                        ? `Was ${displayCell(table, before) || "none"}`
                        : undefined
                  }
                  onBlur={(e) => {
                    if (typing?.ownedId === id && typing.column === column) commit(id, column, e.target.value);
                  }}
                  onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => handleKeyDown(e, row, column)}
                  onPaste={(e: ClipboardEvent<HTMLInputElement>) => handlePaste(e, row, column)}
                  inputProps={{
                    inputMode: table.all === undefined ? "numeric" : "text",
                    "aria-label": `${label}, ${positionWord.one} ${position}, ${name}`,
                  }}
                  sx={[
                    {
                      width: "3.2em",
                      borderBottom: 1,
                      borderColor: "divider",
                      "& input": { textAlign: "center", py: 0.25 },
                    },
                    changed && CHANGED_TEXT_SX,
                  ]}
                />
              </DataCell>
            );
          })}
        </DataRow>
      ))}
    </DataTable>
  );
}
