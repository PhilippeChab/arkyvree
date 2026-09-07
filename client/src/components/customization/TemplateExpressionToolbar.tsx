import { Button, Stack, Tooltip } from "@mui/material";
import type { RefObject } from "react";
import type { TemplateExpressionInputRef } from "./TemplateExpressionInput.tsx";

/** Operator display chars → expression chars (we render math symbols but save ASCII). */
const OPERATORS: { display: string; insert: string }[] = [
  { display: "+", insert: "+" },
  { display: "−", insert: "-" },
  { display: "×", insert: "*" },
  { display: "÷", insert: "/" },
];

const FUNCTIONS = ["floor", "ceil", "min", "max", "abs"];

interface TemplateExpressionToolbarProps {
  inputRef: RefObject<TemplateExpressionInputRef | null>;
  disabled?: boolean;
}

/**
 * Inline operator + function toolbar that drives a sibling
 * `TemplateExpressionInput` through its ref API. Designed to sit next to the
 * literal/template toggle so the user sees their authoring options at a
 * glance once template mode is on.
 */
export function TemplateExpressionToolbar({ inputRef, disabled }: TemplateExpressionToolbarProps) {
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
      {OPERATORS.map((op) => (
        <Tooltip key={op.insert} title={`Insert ${op.display}`}>
          <span>
            <Button
              size="small"
              variant="outlined"
              onClick={() => inputRef.current?.insertText(op.insert)}
              disabled={disabled}
              sx={{ minWidth: 28, fontFamily: "monospace", px: 0.75, py: 0.25 }}
            >
              {op.display}
            </Button>
          </span>
        </Tooltip>
      ))}
      {FUNCTIONS.map((fn) => (
        <Tooltip key={fn} title={`Wrap selection in ${fn}()`}>
          <span>
            <Button
              size="small"
              variant="outlined"
              onClick={() => inputRef.current?.wrapSelection(`${fn}(`, ")")}
              disabled={disabled}
              sx={{ fontFamily: "monospace", px: 0.75, py: 0.25 }}
            >
              {fn}()
            </Button>
          </span>
        </Tooltip>
      ))}
    </Stack>
  );
}
