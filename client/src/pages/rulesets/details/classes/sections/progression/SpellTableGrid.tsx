import { InputBase } from "@mui/material";
import { type ClipboardEvent, type KeyboardEvent, useState } from "react";

import { DataCell, DataRow, DataTable, ValueChip } from "@/client/src/components/common/index.ts";

import { CHANGED_TEXT_SX } from "./changedCell.ts";
import {
  parseSpellCell,
  type PlacedCell,
  placeSpellTable,
  type SpellCell,
  type SpellTableRules,
} from "./spellPaste.ts";

interface SpellTableGridProps {
  /** A cell whose spells an earlier level has all of: it shows All, and takes nothing */
  knownAbove: (levelId: string, spellLevel: number) => boolean;
  levels: readonly { id: string; level: number }[];
  /** Cells a typed value or a paste writes */
  onCells: (cells: PlacedCell[]) => void;
  /** A block was pasted into a cell under an earlier All, which takes nothing */
  onLockedPaste: () => void;
  readOnly: boolean;
  /** A cell's value as saved: a changed cell is marked against it */
  saved: (levelId: string, spellLevel: number) => SpellCell;
  /** The table as its rules describe it: its label, its columns (its spell levels, from 0), its word for every spell */
  table: SpellTableRules;
  /** A cell's value as the tab holds it */
  value: (levelId: string, spellLevel: number) => SpellCell;
}

/** The id of a cell's input, which Enter moves down a column by. */
function cellId(label: string, row: number, column: number) {
  return `${label.replaceAll(" ", "-").toLowerCase()}-${row}-${column}`;
}

/** A cell of a table as its input shows it: empty for none, the table's word for every spell of its list ("All"). */
function displayCell(table: SpellTableRules, cell: SpellCell) {
  if (cell === null) return "";
  return cell === "all" ? (table.all ?? "") : String(cell);
}

/**
 * A class's spell table as the book prints it, one row a class level, one column a spell level, its totals edited in
 * place: a typed cell writes as it's left (Enter moves down its column; what it can't read leaves it as it was), a
 * block pasted into a cell fills from there (rows naming their level land on it), and a changed cell is marked until
 * the tab's save.
 */
export function SpellTableGrid({
  knownAbove,
  levels,
  onCells,
  onLockedPaste,
  readOnly,
  saved,
  table,
  value,
}: SpellTableGridProps) {
  const { label } = table;
  // The cell being typed in, and its text, until it's left
  const [typing, setTyping] = useState<{ levelId: string; spellLevel: number; text: string } | null>(null);

  const commit = (levelId: string, spellLevel: number, text: string) => {
    setTyping(null);
    const cell = parseSpellCell(text, table);
    if (cell !== undefined && cell !== value(levelId, spellLevel)) onCells([{ levelId, spellLevel, value: cell }]);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>, row: number, column: number) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const next = Math.min(levels.length - 1, Math.max(0, row + (event.shiftKey ? -1 : 1)));
    event.currentTarget.blur();
    document.getElementById(cellId(label, next, column))?.focus();
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>, row: number, column: number) => {
    // A block, or a row's cells (a PDF's, by spaces), fills from the cell; a value alone is the cell's own text
    const text = event.clipboardData.getData("text/plain");
    if (readOnly || !/[\s,;|]/.test(text.trim())) return;
    if (knownAbove(levels[row]?.id ?? "", column)) {
      event.preventDefault();
      onLockedPaste();
      return;
    }
    event.preventDefault();
    // The paste is the cell's value now, not what was typed before it
    setTyping(null);
    // From the spell level its header names, else the cell's
    onCells(placeSpellTable(text, table, levels, row, column));
  };

  return (
    <DataTable
      framed
      size="small"
      minWidth={640}
      columns={[
        { key: "level", label: "Level", width: "9%" },
        ...table.columns.map((column) => ({ key: column.key, label: column.label, align: "center" as const })),
      ]}
    >
      {levels.map(({ id, level }, row) => (
        <DataRow key={id}>
          <DataCell slot="primary">
            <ValueChip label={level} color="primary" />
          </DataCell>
          {table.columns.map((column, spellLevel) => {
            const cell = value(id, spellLevel);
            const before = saved(id, spellLevel);
            const changed = cell !== before;
            const name = column.label;
            return (
              <DataCell
                key={spellLevel}
                slot="labeled"
                label={name}
                align="center"
                sx={[changed && { bgcolor: "action.selected" }]}
              >
                <InputBase
                  id={cellId(label, row, spellLevel)}
                  value={
                    typing?.levelId === id && typing.spellLevel === spellLevel ? typing.text : displayCell(table, cell)
                  }
                  readOnly={readOnly || knownAbove(id, spellLevel)}
                  onChange={(e) => setTyping({ levelId: id, spellLevel, text: e.target.value })}
                  title={
                    knownAbove(id, spellLevel)
                      ? "All Known From an Earlier Level"
                      : changed
                        ? `Was ${displayCell(table, before) || "none"}`
                        : undefined
                  }
                  onBlur={(e) => {
                    if (typing?.levelId === id && typing.spellLevel === spellLevel)
                      commit(id, spellLevel, e.target.value);
                  }}
                  onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => handleKeyDown(e, row, spellLevel)}
                  onPaste={(e: ClipboardEvent<HTMLInputElement>) => handlePaste(e, row, spellLevel)}
                  inputProps={{
                    inputMode: table.all === undefined ? "numeric" : "text",
                    "aria-label": `${label}, Level ${level}, ${name}`,
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
