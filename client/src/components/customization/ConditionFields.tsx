import { HelpOutlined } from "@mui/icons-material";
import { Box, FormControlLabel, Switch, Tooltip } from "@mui/material";
import { useRef, useState } from "react";
import type { FieldError } from "react-hook-form";

import { Crossfade } from "@/client/src/components/common/index.ts";
import { extractTemplateExpression, isTemplateValue } from "@/client/src/lib/templateValues.ts";

import { OperatorSelect } from "./OperatorSelect.tsx";
import { PathValueInput } from "./PathValueInput.tsx";
import { defaultValueForPath, fitsPath } from "./pathValues.ts";
import type { PathInfo as TargetPathInfo } from "./TargetPathInput.tsx";
import { TargetPathInput } from "./TargetPathInput.tsx";
import { TemplateExpressionInput, type TemplateExpressionInputRef } from "./TemplateExpressionInput.tsx";
import { TemplateExpressionToolbar } from "./TemplateExpressionToolbar.tsx";

type ConditionField = "target" | "operator" | "value";

type PathInfo = Omit<TargetPathInfo, "path">;

/** A form's field, as `useController` binds it: its value, its change and its error. */
interface BoundField {
  field: { value: string | undefined; onChange: (value: string) => void };
  fieldState: { error?: FieldError };
}

interface ConditionFieldsProps {
  kind: "modifier" | "requirement";
  rulesetId: string;
  /** Filters target-path completions to those allowed for this entity type. Not applied to the template path picker. */
  entityType?: string;
  /** "create" autofills value/operator from the path's defaults; "edit" preserves the loaded values. */
  mode: "create" | "edit";
  /** Its form's target, operator and value, each bound to the form (`useController`). */
  fields: Record<ConditionField, BoundField>;
}

/**
 * A modifier's or requirement's target path, operator and value. The value is a literal or a `{{ template }}`; either
 * way its field gets the string to save.
 */
export function ConditionFields({ kind, rulesetId, entityType, mode, fields }: ConditionFieldsProps) {
  const values = {
    target: fields.target.field.value ?? "",
    operator: fields.operator.field.value ?? "",
    value: fields.value.field.value ?? "",
  };
  const errors = {
    target: fields.target.fieldState.error,
    operator: fields.operator.fieldState.error,
    value: fields.value.fieldState.error,
  };
  const onChange = (field: ConditionField, next: string) => fields[field].field.onChange(next);
  const { value } = values;

  const [pathInfo, setPathInfo] = useState<PathInfo | null>(null);
  const [templateMode, setTemplateMode] = useState(() => isTemplateValue(value));
  const [templateExpression, setTemplateExpression] = useState(() =>
    isTemplateValue(value) ? (extractTemplateExpression(value) ?? "") : "",
  );
  const [literalValue, setLiteralValue] = useState(() => (isTemplateValue(value) ? "" : value));

  const expressionInputRef = useRef<TemplateExpressionInputRef | null>(null);

  // The value's editor (its mode, and each mode's text) is its own: seeded from the value as it mounts, once its dialog
  // opens on a reset form, then writing the value it makes. The value never comes back into it, so a dialog reopened
  // during its exit transition (still mounted) keeps the editor it closed with.
  const writeFormValue = (next: string) => {
    if (next !== value) onChange("value", next);
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
              setValues: info.setValues,
              literalOnly: info.literalOnly,
            });
            // In edit mode the form already carries a saved value/operator —
            // don't overwrite. In create mode, seed a default only when the
            // field is empty or the existing value doesn't suit the new path
            // (not one of its choices, or not a number) — preserves
            // duplicate-from-row and any in-progress user input.
            const operator = info.operators.includes(values.operator) ? values.operator : (info.operators[0] ?? "");
            // A set the path restricts takes its own values
            const choices = operator === "set" && info.setValues ? info.setValues : info.possibleValues;
            if (mode === "create") {
              // The literal, even while the template shows: it's what turning the template off restores.
              const currentValue = templateMode ? literalValue : values.value;
              if (!currentValue || !fitsPath(currentValue, info.valueType, choices)) {
                const seeded = defaultValueForPath(info.valueType, choices);
                setLiteralValue(seeded);
                if (!templateMode) writeFormValue(seeded);
              }
            }
            if (operator !== values.operator) onChange("operator", operator);
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
        onChange={(nextOperator) => {
          onChange("operator", nextOperator);
          // A set the path restricts starts on its first value
          const setChoices = nextOperator === "set" ? pathInfo?.setValues : undefined;
          if (setChoices?.length && !setChoices.some((choice) => choice.value === literalValue)) {
            handleLiteralChange(setChoices[0].value);
          }
        }}
        error={!!errors.operator}
        operators={pathInfo?.operators || []}
      />
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          mb: -1,
          flexWrap: "wrap",
        }}
      >
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={templateMode}
              // A path the level-up counts without a character takes a literal: a template can only be turned off
              disabled={!!pathInfo?.literalOnly && !templateMode}
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
        {templateMode && <TemplateExpressionToolbar inputRef={expressionInputRef} disabled={!templateMode} />}
      </Box>
      <Crossfade
        showFirst={!templateMode}
        first={
          <PathValueInput
            value={literalValue}
            onChange={handleLiteralChange}
            valueType={pathInfo?.valueType}
            possibleValues={
              values.operator === "set" && pathInfo?.setValues ? pathInfo.setValues : pathInfo?.possibleValues
            }
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
                : kind === "modifier"
                  ? "e.g., 2, -1, 5"
                  : "e.g., 13, 5, true"
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
