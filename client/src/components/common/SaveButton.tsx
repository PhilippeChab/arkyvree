import { Button, Stack } from "@mui/material";

import { DiceSpinner } from "./DiceSpinner.tsx";

interface SaveButtonProps {
  /** Whether the form holds a change to save: the button waits for one. */
  canSave: boolean;
  /** Its words, "Save" unless the form says what it saves ("Update Password"). */
  label?: string;
  /** The save is running. */
  pending: boolean;
}

/**
 * An inline form's submit (an entity's editor, the sheet's identity, the profile's forms): at the form's end on the
 * right, enabled once something changes.
 */
export function SaveButton({ canSave, label = "Save", pending }: SaveButtonProps) {
  return (
    // Across its form, whatever the form aligns its fields to
    <Stack direction="row" sx={{ alignSelf: "stretch", justifyContent: "flex-end" }}>
      <Button type="submit" variant="contained" disabled={!canSave || pending}>
        <DiceSpinner size="small" loading={pending}>
          {label}
        </DiceSpinner>
      </Button>
    </Stack>
  );
}
