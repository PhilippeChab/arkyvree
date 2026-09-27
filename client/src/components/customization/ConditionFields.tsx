import type { PathInfo as TargetPathInfo } from "./TargetPathInput.tsx";
import { Crossfade } from "@/client/src/components/common/index.ts";
import { extractTemplateExpression, isTemplateValue } from "@/client/src/lib/templateValues.ts";
import { HelpOutlined } from "@mui/icons-material";
import { Box, FormControlLabel, Switch, Tooltip } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import type { FieldError } from "react-hook-form";
import { defaultValueForPath, fitsPath } from "./pathValues.ts";
import { OperatorSelect } from "./OperatorSelect.tsx";
import { PathValueInput } from "./PathValueInput.tsx";
import { TargetPathInput } from "./TargetPathInput.tsx";
import { TemplateExpressionInput, type TemplateExpressionInputRef } from "./TemplateExpressionInput.tsx";
import { TemplateExpressionToolbar } from "./TemplateExpressionToolbar.tsx";

type ConditionField = "target" | "operator" | "value";

type PathInfo = Omit<TargetPathInfo, "path">;

interface ConditionFieldsProps {
  kind: "modifier" | "requirement";
  rulesetId: string;
  /** Filters target-path completions to those allowed for this entity type. Not applied to the template path picker. */
  entityType?: string;
  /** "create" autofills value/operator from the path's defaults; "edit" preserves the loaded values. */
  mode: "create" | "edit";
  values: Record<ConditionField, string>;
  errors: Partial<Record<ConditionField, FieldError>>;
  /** Writes a field (and clears its error). */
  onChange: (field: ConditionField, value: string) => void;
}

/**
 * A modifier's or requirement's target path, operator and value. The value is
 * a literal or a `{{ template }}`; either way `onChange("value")` gets the
 * string to save.
 */
export function ConditionFields({ kind, rulesetId, entityType, mode, values, errors, onChange }: ConditionFieldsProps) {
  const { value } = values;

  const [pathInfo, setPathInfo] = useState<PathInfo | null>(null);
  const [templateMode, setTemplateMode] = useState(() => isTemplateValue(value));
  const [templateExpression, setTemplateExpression] = useState(() =>
    isTemplateValue(value) ? extractTemplateExpression(value) ?? "" : "",
  );
  const [literalValue, setLiteralValue] = useState(() =>
    isTemplateValue(value) ? "" : value,
  );

  // Distinguishes parent-driven value resets (e.g. form.reset on edit open) from
  // our own internal sync writes — without it the writes would loop back through
  // the watcher and clobber in-progress UI state.
  const internalSync = useRef(false);
  const expressionInputRef = useRef<TemplateExpressionInputRef | null>(null);

  useEffect(() => {
    if (internalSync.current) {
      internalSync.current = false;
      return;
    }
    if (isTemplateValue(value)) {
      // oxlint-disable-next-line react/set-state-in-effect
      setTemplateMode(true);
      setTemplateExpression(extractTemplateExpression(value) ?? "");
      setLiteralValue("");
    } else {
      setTemplateMode(false);
      setTemplateExpression("");
      setLiteralValue(value);
    }
  }, [value]);

  const writeFormValue = (next: string) => {
    // Only a change reaches the effect above, so only a change is marked as ours.
    if (next === value) return;
    internalSync.current = true;
    onChange("value", next);
  };

  const handleLiteralChange = (v: string) => {
    setLiteralValue(v);
    writeFormValue(v);
  };

  const handleExpressionChange = (expr: string) => {
    setTemplateExpression(expr);
    writeFormValue(expr.trim() ? `{{ ${expr} }}` : "");
  };

  // The other mode's input keeps its text, so switching back restores it.
  const handleToggleTemplate = (checked: boolean) => {
    setTemplateMode(checked);
    if (checked) {
      writeFormValue(templateExpression.trim() ? `{{ ${templateExpression} }}` : "");
    } else {
      writeFormValue(literalValue);
    }
  };

  return (
    <>
      <TargetPathInput
        rulesetId={rulesetId}
        kind={kind}
        entityType={entityType}
        value={values.target}
        onChange={(nextTarget) => onChange("target", nextTarget)}
        onPathInfoChange={(info) => {
          if (info) {
            setPathInfo({
              valueType: info.valueType,
              operators: info.operators,
              possibleValues: info.possibleValues,
            });
            // In edit mode the form already carries a saved value/operator —
            // don't overwrite. In create mode, seed a default only when the
            // field is empty or the existing value doesn't suit the new path
            // (not one of its choices, or not a number) — preserves
            // duplicate-from-row and any in-progress user input.
            if (mode === "create") {
              // The literal, even while the template shows: it's what turning the template off restores.
              const currentValue = templateMode ? literalValue : values.value;
              if (!currentValue || !fitsPath(currentValue, info.valueType, info.possibleValues)) {
                const seeded = defaultValueForPath(info.valueType, info.possibleValues);
                setLiteralValue(seeded);
                if (!templateMode) writeFormValue(seeded);
              }
            }
            if (!info.operators.includes(values.operator)) {
              onChange("operator", info.operators[0] ?? "");
            }
          } else {
            setPathInfo(null);
          }
        }}
        error={!!errors.target}
        helperText={errors.target?.message}
        label={kind === "modifier" ? "Modifier Path" : "Target"}
      />
      <OperatorSelect
        kind={kind}
        value={values.operator}
        onChange={(nextOperator) => onChange("operator", nextOperator)}
        error={!!errors.operator}
        operators={pathInfo?.operators || []}
      />
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: -1, flexWrap: "wrap" }}>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={templateMode}
              onChange={(_, checked) => handleToggleTemplate(checked)}
            />
          }
          label={
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              Template
              <Tooltip
                title="Compute the value from another path or an expression. Wrap paths in [brackets] and use floor/ceil/min/max plus +-*/ for arithmetic. Examples: [abilities.charisma.modifier], floor([classes.ranger.level] / 2), max(0, [classes.beastmaster.level] + 3)."
                arrow
              >
                <HelpOutlined sx={{ fontSize: 16, color: "text.secondary", cursor: "help" }} />
              </Tooltip>
            </Box>
          }
        />
        {templateMode && (
          <TemplateExpressionToolbar inputRef={expressionInputRef} disabled={!templateMode} />
        )}
      </Box>
      <Crossfade
        showFirst={!templateMode}
        first={
          <PathValueInput
            value={literalValue}
            onChange={handleLiteralChange}
            valueType={pathInfo?.valueType}
            possibleValues={pathInfo?.possibleValues}
            required
            // Crossfade keeps it mounted under the template input: disabled, it can't be focused or block the submit.
            disabled={templateMode}
            error={!!errors.value}
            helperText={errors.value?.message}
            placeholder={
              pathInfo
                ? pathInfo.valueType === "boolean"
                  ? "true or false"
                  : pathInfo.valueType === "string"
                    ? "text value"
                    : "numeric value"
                : kind === "modifier" ? "e.g., 2, -1, 5" : "e.g., 13, 5, true"
            }
          />
        }
        second={
          <TemplateExpressionInput
            ref={expressionInputRef}
            value={templateExpression}
            onChange={handleExpressionChange}
            rulesetId={rulesetId}
            kind={kind}
            disabled={!templateMode}
            error={!!errors.value}
            helperText={errors.value?.message}
          />
        }
      />
    </>
  );
}
