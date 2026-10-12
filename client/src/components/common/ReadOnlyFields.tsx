import { Box } from "@mui/material";
import type { ReactNode } from "react";

import { ReadOnlyFieldsContext } from "./readOnlyFieldsContext.ts";

/** What `ReadOnlyFields` takes: whether the viewer only reads the form it holds. */
interface ReadOnlyFieldsProps {
  children: ReactNode;
  readOnly: boolean;
}

/**
 * Fields a viewer reads, as values on display, never inputs: each in its place under its label, with no outline in any
 * state, nothing to open, remove or type into, and its value at full contrast; a switch or a checkbox shows its state,
 * muted, and answers no pointer.
 */
const READ_ONLY_FIELDS_SX = {
  "& .MuiOutlinedInput-notchedOutline": { borderStyle: "none" },
  // Each label above its value, as a filled field's, an empty one's too: its value is none, never the label
  "& .MuiInputLabel-outlined": { transform: "translate(14px, -9px) scale(0.75)", maxWidth: "calc(133% - 32px)" },
  "& .MuiInputLabel-root.Mui-focused": { color: "text.secondary" },
  "& .MuiInputBase-input::placeholder": { opacity: 0 },
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
