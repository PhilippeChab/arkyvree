import { IconButton, InputAdornment, Popover, TextField, Tooltip } from "@mui/material";
import { type MouseEvent, type Ref, useImperativeHandle, useRef, useState } from "react";

import { AccountTreeIcon } from "@/client/src/components/icons/index.ts";

import { TargetPathInput } from "./TargetPathInput.tsx";

interface TemplateExpressionInputProps {
  /** Inner expression (without the surrounding `{{ }}`). */
  value: string;
  /** Called with the new inner expression whenever the user edits. */
  onChange: (expression: string) => void;
  rulesetId: string;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  /** The insertion API the parent's operator toolbar calls */
  ref?: Ref<TemplateExpressionInputRef>;
}

/**
 * Imperative API exposed via ref for the parent's operator toolbar.
 * The parent owns the toolbar so it can live inline next to the
 * literal/template toggle; we just expose the insertion primitives.
 */
export interface TemplateExpressionInputRef {
  /** Insert raw text at the current cursor position. */
  insertText: (text: string) => void;
  /** Wrap the current selection with `${prefix}selection${suffix}`. If no
   *  selection, insert `${prefix}${suffix}` with cursor between. */
  wrapSelection: (prefix: string, suffix: string) => void;
}

/**
 * Single monospace expression field. The path-picker popover (tree icon)
 * lives inside this component; the operator toolbar (math + functions) is
 * rendered by the parent next to the literal/template toggle and uses the
 * ref API to insert into this field's value.
 */
export function TemplateExpressionInput({
  value,
  onChange,
  rulesetId,
  disabled,
  error,
  helperText,
  ref,
}: TemplateExpressionInputProps) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const cursorRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const [pickerAnchorEl, setPickerAnchorEl] = useState<HTMLElement | null>(null);
  const [pickerPath, setPickerPath] = useState("");

  const getSelection = () => {
    const input = inputRef.current;
    return {
      start: input?.selectionStart ?? value.length,
      end: input?.selectionEnd ?? value.length,
    };
  };

  const writeAndFocus = (next: string, cursorPos: number) => {
    onChange(next);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(cursorPos, cursorPos);
    });
  };

  useImperativeHandle(ref, () => ({
    insertText: (text: string) => {
      const { start, end } = getSelection();
      const before = value.slice(0, start);
      const after = value.slice(end);
      // Pad with spaces unless we're already flush against whitespace or boundary.
      const left = before.length === 0 || /\s$/.test(before) ? "" : " ";
      const right = after.length === 0 || /^\s/.test(after) ? "" : " ";
      const inserted = `${left}${text}${right}`;
      const next = before + inserted + after;
      writeAndFocus(next, start + inserted.length);
    },
    wrapSelection: (prefix: string, suffix: string) => {
      const { start, end } = getSelection();
      const before = value.slice(0, start);
      const after = value.slice(end);
      const selected = value.slice(start, end);
      const inserted = `${prefix}${selected}${suffix}`;
      const next = before + inserted + after;
      // If there was a selection, place cursor after; otherwise place it
      // between prefix and suffix so the user can type immediately.
      const cursorPos = selected.length > 0 ? start + inserted.length : start + prefix.length;
      writeAndFocus(next, cursorPos);
    },
  }));

  const openPicker = (event: MouseEvent<HTMLElement>) => {
    cursorRef.current = getSelection();
    setPickerPath("");
    setPickerAnchorEl(event.currentTarget);
  };

  const closePicker = () => {
    setPickerAnchorEl(null);
    setPickerPath("");
  };

  const insertBracketed = (path: string) => {
    const bracketed = `[${path}]`;
    const { start, end } = cursorRef.current;
    const next = value.slice(0, start) + bracketed + value.slice(end);
    closePicker();
    writeAndFocus(next, start + bracketed.length);
  };

  return (
    <>
      <TextField
        fullWidth
        value={value}
        onChange={(e) => onChange(e.target.value)}
        label="Template Expression"
        placeholder="floor([classes.ranger.level] / 2)"
        required
        error={error}
        helperText={helperText}
        disabled={disabled}
        inputRef={inputRef}
        slotProps={{
          input: {
            sx: { fontFamily: "monospace" },
            endAdornment: (
              <InputAdornment position="end">
                <Tooltip title="Insert path…">
                  <span>
                    <IconButton
                      size="small"
                      aria-label="Insert path"
                      onClick={openPicker}
                      disabled={disabled}
                      edge="end"
                    >
                      <AccountTreeIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </InputAdornment>
            ),
          },
        }}
      />
      <Popover
        open={Boolean(pickerAnchorEl)}
        anchorEl={pickerAnchorEl}
        onClose={closePicker}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { p: 2, minWidth: 560, maxWidth: "90vw" } } }}
      >
        <TargetPathInput
          rulesetId={rulesetId}
          kind="template"
          value={pickerPath}
          onChange={(path, picked) => {
            if (picked) insertBracketed(path);
            else setPickerPath(path);
          }}
          label="Pick a path to insert"
        />
      </Popover>
    </>
  );
}
