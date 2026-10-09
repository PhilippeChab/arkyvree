import { Button, Stack, Tooltip } from "@mui/material";
import type { RefObject } from "react";

import { TEMPLATE_FUNCTIONS } from "@/shared/customization/templateExpression.ts";

import type { TemplateExpressionInputRef } from "./TemplateExpressionInput.tsx";

interface TemplateExpressionToolbarProps {
  /** The expression input the toolbar writes into, through its handle. */
  expressionRef: RefObject<TemplateExpressionInputRef | null>;
}

/** Operator display chars → expression chars (we render math symbols but save ASCII). */
const OPERATORS: { display: string; insert: string }[] = [
  { display: "+", insert: "+" },
  { display: "−", insert: "-" },
  { display: "×", insert: "*" },
  { display: "÷", insert: "/" },
];

/**
 * Inline operator + function toolbar that drives a sibling
 * `TemplateExpressionInput` through its ref API. Designed to sit next to the
 * literal/template toggle so the user sees their authoring options at a
 * glance once template mode is on. Its functions are those a template calls.
 */
export function TemplateExpressionToolbar({ expressionRef }: TemplateExpressionToolbarProps) {
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
      {OPERATORS.map((op) => (
        <Tooltip key={op.insert} describeChild title={`Insert ${op.display}`}>
          <Button
            size="small"
            variant="outlined"
            onClick={() => expressionRef.current?.insertText(op.insert)}
            sx={{ minWidth: 28, fontFamily: "monospace", px: 0.75, py: 0.25 }}
          >
            {op.display}
          </Button>
        </Tooltip>
      ))}
      {Object.keys(TEMPLATE_FUNCTIONS).map((fn) => (
        <Tooltip key={fn} describeChild title={`Wrap Selection in ${fn}()`}>
          <Button
            size="small"
            variant="outlined"
            onClick={() => expressionRef.current?.wrapSelection(`${fn}(`, ")")}
            sx={{ fontFamily: "monospace", px: 0.75, py: 0.25 }}
          >
            {fn}()
          </Button>
        </Tooltip>
      ))}
    </Stack>
  );
}
