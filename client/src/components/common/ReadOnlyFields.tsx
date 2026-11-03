import { Box } from "@mui/material";
import type { ReactNode } from "react";

import { ReadOnlyFieldsContext } from "./readOnlyFieldsContext.ts";

/** What `ReadOnlyFields` takes: whether the viewer only reads the form it holds. */
interface ReadOnlyFieldsProps {
  children: ReactNode;
  readOnly: boolean;
}

/**
 * Fields a viewer reads, as values on display, never inputs: each in its place, its label above its value, as tall as
 * they are (a multiline one too: its form gives it its text's rows), with no outline in any state, nothing to open,
 * remove or type into, and its value at full contrast, "—" muted for none; a switch or a checkbox shows its state,
 * muted, and answers no pointer.
 */
const READ_ONLY_FIELDS_SX = {
  "& .MuiOutlinedInput-notchedOutline": { borderStyle: "none" },
  "& .MuiInputLabel-root": { position: "static", transform: "none", maxWidth: "100%", px: 1.75, fontSize: "0.75rem" },
  "& .MuiInputLabel-root.Mui-focused": { color: "text.secondary" },
  "& .MuiOutlinedInput-input, & .MuiInputBase-multiline": { py: 0 },
  "& .MuiAutocomplete-root .MuiAutocomplete-inputRoot": { py: 0 },
  "& .MuiAutocomplete-root .MuiAutocomplete-inputRoot .MuiAutocomplete-input": { py: 0 },
  // Beside its chips, a list holds nothing more to type
  "& .MuiChip-root ~ .MuiAutocomplete-input": { display: "none" },
  "& .MuiInputBase-input::placeholder": { opacity: 1, color: "text.secondary" },
  "& .MuiSelect-icon, & .MuiAutocomplete-popupIndicator, & .MuiAutocomplete-clearIndicator, & .MuiChip-deleteIcon": {
    display: "none",
  },
  "& .MuiInputBase-root textarea": { resize: "none" },
  "& input[type=number]": { MozAppearance: "textfield" },
  "& input::-webkit-inner-spin-button, & input::-webkit-outer-spin-button": { WebkitAppearance: "none", m: 0 },
  "& .MuiInputBase-root, & .MuiInputBase-input, & .MuiSelect-select, & .MuiFormControlLabel-root": {
    cursor: "default",
  },
  "& .MuiSwitch-root, & .MuiCheckbox-root": { opacity: 0.6, pointerEvents: "none" },
  "& .MuiSwitch-root .MuiTouchRipple-root, & .MuiCheckbox-root .MuiTouchRipple-root": { display: "none" },
};

/**
 * A form a viewer who can't edit it reads: its fields, the shared ones and any input that asks `useReadOnlyFields`, are
 * read-only (never disabled) and look it, values on display rather than inputs, and its form shows no Save
 * (`EntityDetailsCard`).
 */
export function ReadOnlyFields({ children, readOnly }: ReadOnlyFieldsProps) {
  return (
    <ReadOnlyFieldsContext.Provider value={readOnly}>
      {readOnly ? <Box sx={READ_ONLY_FIELDS_SX}>{children}</Box> : children}
    </ReadOnlyFieldsContext.Provider>
  );
}
