/** A character's notes and private notes, as its creation and its sheet's identity write them. */

import type { Control, FieldPath, FieldValues } from "react-hook-form";

import { FormTextField } from "@/client/src/components/common/index.ts";

interface NotesFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  /** Shown as it is: the viewer can't edit the character. */
  readOnly?: boolean;
  size?: "small" | "medium";
}

interface NotesTextFieldProps<T extends FieldValues> extends NotesFieldProps<T> {
  label: string;
  placeholder: string;
}

/** A notes field: several lines, resizable. */
function NotesTextField<T extends FieldValues>({ readOnly = false, ...field }: NotesTextFieldProps<T>) {
  return (
    <FormTextField
      {...field}
      multiline
      minRows={3}
      fullWidth
      slotProps={{ input: { readOnly } }}
      sx={{ "& textarea": { resize: "vertical" } }}
    />
  );
}

/** What anyone who reads the character's sheet reads. */
export function NotesField<T extends FieldValues>({ ...field }: NotesFieldProps<T>) {
  return <NotesTextField {...field} label="Notes" placeholder="Campaign notes, character development, reminders…" />;
}

/** What the character's editors and its campaign's Game Master read alone. */
export function PrivateNotesField<T extends FieldValues>({ ...field }: NotesFieldProps<T>) {
  return (
    <NotesTextField
      {...field}
      label="Private Notes"
      placeholder="Secrets and plans only the character's editors and the Game Master see…"
    />
  );
}
