import { InputBase } from "@mui/material";
import { type ClipboardEvent, type KeyboardEvent, useState } from "react";

import { DataCell, DataRow, DataTable, ValueChip } from "@/client/src/components/common/index.ts";

import { spellLevelLabel } from "./spellLevels.ts";
import { parseSpellCell, parseSpellRows, type PlacedCell, placeSpellRows, type SpellCell } from "./spellPaste.ts";

interface SpellTableGridProps {
  /** Spells known take "all" (every spell of the list) */
  allowsAll: boolean;
  /** The table's columns: its spell levels, from 0 */
  columns: number;
  /** What the table says it is ("Spells per Day") */
  label: string;
  levels: readonly { id: string; level: number }[];
  /** Cells a typed value or a paste writes */
  onCells: (cells: PlacedCell[]) => void;
  readOnly: boolean;
  /** A cell's value as saved: a changed cell is marked against it */
  saved: (levelId: string, spellLevel: number) => SpellCell;
  /** A cell's value as the tab holds it */
  value: (levelId: string, spellLevel: number) => SpellCell;
}

/** The id of a cell's input, which Enter moves down a column by. */
function cellId(label: string, row: number, column: number) {
  return `${label.replaceAll(" ", "-").toLowerCase()}-${row}-${column}`;
}

/** A cell as its input shows it: empty for none, "All" for every spell of its list. */
function displayCell(cell: SpellCell) {
  if (cell === null) return "";
  return cell === "all" ? "All" : String(cell);
}

/**
 * A class's spell table as the book prints it, one row a class level, one column a spell level, its totals edited in
 * place: a typed cell writes as it's left (Enter moves down its column; what it can't read leaves it as it was), a
 * block pasted into a cell fills from there (rows naming their level land on it), and a changed cell is marked until
 * the tab's save.
 */
export function SpellTableGrid({
  allowsAll,
  columns,
  label,
  levels,
  onCells,
  readOnly,
  saved,
  value,
}: SpellTableGridProps) {
  // The cell being typed in, and its text, until it's left
  const [typing, setTyping] = useState<{ levelId: string; spellLevel: number; text: string } | null>(null);

  const commit = (levelId: string, spellLevel: number, text: string) => {
    setTyping(null);
    const cell = parseSpellCell(text, allowsAll);
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
    event.preventDefault();
    // The paste is the cell's value now, not what was typed before it
    setTyping(null);
    onCells(placeSpellRows(parseSpellRows(text, allowsAll, levels[row]?.level), levels, row, column, columns));
  };

  return (
    <DataTable
      framed
      size="small"
      minWidth={640}
      columns={[
        { key: "level", label: "Level", width: "9%" },
        ...Array.from({ length: columns }, (_, spellLevel) => ({
          key: String(spellLevel),
          label: spellLevelLabel(String(spellLevel)),
          align: "center" as const,
        })),
      ]}
    >
      {levels.map(({ id, level }, row) => (
        <DataRow key={id}>
          <DataCell slot="primary">
            <ValueChip label={level} color="primary" />
          </DataCell>
          {Array.from({ length: columns }, (_, spellLevel) => {
            const cell = value(id, spellLevel);
            const before = saved(id, spellLevel);
            const changed = cell !== before;
            const name = spellLevelLabel(String(spellLevel));
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
                  value={typing?.levelId === id && typing.spellLevel === spellLevel ? typing.text : displayCell(cell)}
                  readOnly={readOnly}
                  onChange={(e) => setTyping({ levelId: id, spellLevel, text: e.target.value })}
                  title={changed ? `Was ${displayCell(before) || "none"}` : undefined}
                  onBlur={(e) => {
                    if (typing?.levelId === id && typing.spellLevel === spellLevel)
                      commit(id, spellLevel, e.target.value);
                  }}
                  onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => handleKeyDown(e, row, spellLevel)}
                  onPaste={(e: ClipboardEvent<HTMLInputElement>) => handlePaste(e, row, spellLevel)}
                  inputProps={{
                    inputMode: allowsAll ? "text" : "numeric",
                    "aria-label": `${label}, Level ${level}, ${name}`,
                  }}
                  sx={[
                    {
                      width: "3.2em",
                      borderBottom: 1,
                      borderColor: "divider",
                      "& input": { textAlign: "center", py: 0.25 },
                    },
                    changed && { fontWeight: 600, color: "secondary.dark" },
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
