import { Button, Stack, Typography } from "@mui/material";

import { TextAreaField } from "@/client/src/components/common/index.ts";
import { useFormWith } from "@/client/src/hooks/index.ts";

import { type PlacedCell, placeSpellTable, type SpellTableRules } from "./spellPaste.ts";

/** The pasted text, as the box's form holds it. */
interface PasteForm {
  table: string;
}

interface SpellPasteBoxProps {
  /** The pasted cells that change the table as it shows, which the box counts */
  changesOf: (cells: PlacedCell[]) => PlacedCell[];
  levels: readonly { id: string; level: number }[];
  onApply: (cells: PlacedCell[]) => void;
  onCancel: () => void;
  /** The table it's pasted into, as its rules describe it */
  table: SpellTableRules;
}

/**
 * A spell table pasted from a book, a PDF or a spreadsheet, one row a class level: how many cells it changes, before
 * Fill Grid writes them onto the grid, unsaved (a row naming its level lands on it, the others from the class's first).
 */
export function SpellPasteBox({ changesOf, levels, onApply, onCancel, table }: SpellPasteBoxProps) {
  const { control, watch } = useFormWith<PasteForm>({ table: "" });
  const text = watch("table");
  // Fill Grid writes every placed cell, as a paste into the grid does: what one writes can depend on another
  // From the class's first level, and the spell level its header names (a paladin's from 1st), else from cantrips
  const placed = placeSpellTable(text, table, levels, 0, 0);
  const changes = changesOf(placed);

  return (
    <Stack spacing={1}>
      <TextAreaField
        control={control}
        name="table"
        label="Pasted Table"
        rows={4}
        autoFocus
        placeholder={"1st  3  1\n2nd  4  2\n3rd  4  2  1"}
        helperText='One row a class level. A leading level ("1st", "4:") is optional; an empty cell or a dash is none.'
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
