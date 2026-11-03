import { Button, Stack, Typography } from "@mui/material";

import { TextAreaField } from "@/client/src/components/common/index.ts";
import { useFormWith } from "@/client/src/hooks/index.ts";
import { type PositionWord, withArticle } from "@/client/src/lib/rulesetLabels.ts";

import { type PlacedCell, placeTable, type TableRules } from "./tablePaste.ts";

/** The pasted text, as the box's form holds it. */
interface PasteForm {
  table: string;
}

interface TablePasteBoxProps {
  /** The pasted cells that change the table as it shows, which the box counts */
  changesOf: (cells: PlacedCell[]) => PlacedCell[];
  onApply: (cells: PlacedCell[]) => void;
  onCancel: () => void;
  ownedEntities: readonly { id: string; position: number }[];
  /** Its rules' word for what a row is ("class level") */
  ownedWord: string;
  /** Its rules' word for an owned entity's position along its owner, which a row may lead with ("level") */
  positionWord: PositionWord;
  /** The table it's pasted into, as its rules describe it */
  table: TableRules;
}

/**
 * A table pasted from a book, a PDF or a spreadsheet, one row an owned entity: how many cells it changes, before
 * Fill Grid writes them onto the grid, unsaved (a row naming its position lands on it, the others from the owner's
 * first).
 */
export function TablePasteBox({
  changesOf,
  ownedEntities,
  ownedWord,
  onApply,
  onCancel,
  positionWord,
  table,
}: TablePasteBoxProps) {
  const { control, watch } = useFormWith<PasteForm>({ table: "" });
  const text = watch("table");
  // Fill Grid writes every placed cell, as a paste into the grid does: what one writes can depend on another
  // From the owner's first owned entity, and the column its header names (a paladin's from 1st), else from its first
  const placed = placeTable(text, table, ownedEntities, 0, 0);
  const changes = changesOf(placed);
  const leading = positionWord.one.toLowerCase();

  return (
    <Stack spacing={1}>
      <TextAreaField
        control={control}
        name="table"
        label="Pasted Table"
        rows={4}
        autoFocus
        placeholder={"1st  3  1\n2nd  4  2\n3rd  4  2  1"}
        helperText={`One row ${withArticle(ownedWord)}. A leading ${leading} ("1st", "4:") is optional; an empty cell or a dash is none.`}
      />
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "flex-end" }}>
        <Typography variant="body2" sx={{ color: "text.secondary", flex: 1 }}>
          {changes.length > 0
            ? `${changes.length} ${changes.length === 1 ? "cell changes" : "cells change"}`
            : text.trim()
              ? "Nothing changes"
              : ""}
        </Typography>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" disabled={changes.length === 0} onClick={() => onApply(placed)}>
          Fill Grid
        </Button>
      </Stack>
    </Stack>
  );
}
