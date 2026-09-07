import { Crossfade } from "@/client/src/components/common/index.ts";
import { extractTemplateExpression, isTemplateValue } from "@/client/src/lib/templateValues.ts";
import { HelpOutlined } from "@mui/icons-material";
import { Box, FormControlLabel, Switch, Tooltip } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { ModifierOperatorSelect } from "./ModifierOperatorSelect.tsx";
import { defaultValueForPath } from "./defaultValueForPath.ts";
import { PathValueInput } from "./PathValueInput.tsx";
import { TargetPathInput } from "./TargetPathInput.tsx";
import { TemplateExpressionInput, type TemplateExpressionInputRef } from "./TemplateExpressionInput.tsx";
import { TemplateExpressionToolbar } from "./TemplateExpressionToolbar.tsx";

export interface ModifierFormData {
  target: string;
  value: string;
  operator: string;
}

interface PathInfo {
  valueType: "number" | "string" | "boolean";
  operators: string[];
  possibleValues?: { value: string; label: string }[];
}

interface ModifierFormProps {
  form: UseFormReturn<ModifierFormData>;
  rulesetId: string;
  /** Filters target-path completions to those allowed for this entity type. Not applied to the template path picker. */
  entityType?: string;
  /** "create" autofills value/operator from the path's defaults; "edit" preserves the loaded values. */
  mode: "create" | "edit";
}

export function ModifierForm({ form, rulesetId, entityType, mode }: ModifierFormProps) {
  const value = form.watch("value") || "";

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
    internalSync.current = true;
    form.setValue("value", next);
    form.clearErrors("value");
  };

  const handleLiteralChange = (v: string) => {
    setLiteralValue(v);
    writeFormValue(v);
  };

  const handleExpressionChange = (expr: string) => {
    setTemplateExpression(expr);
    writeFormValue(expr.trim() ? `{{ ${expr} }}` : "");
  };

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
        kind="modifier"
        entityType={entityType}
        value={form.watch("target") || ""}
        onChange={(nextTarget) => {
          form.setValue("target", nextTarget);
          form.clearErrors("target");
        }}
        onPathInfoChange={(info) => {
          if (info) {
            const valueType = info.valueType as PathInfo["valueType"];
            setPathInfo({
              valueType,
              operators: info.operators,
              possibleValues: info.possibleValues,
            });
            // In edit mode the form already carries a saved value/operator —
            // don't overwrite. In create mode, seed a default only when the
            // field is empty or the existing value isn't valid for the new
            // path's enum — preserves duplicate-from-row and any in-progress
            // user input.
            if (mode === "create") {
              const currentValue = form.watch("value") || "";
              const compatible = !info.possibleValues
                || info.possibleValues.some((v) => v.value === currentValue);
              if (!currentValue || !compatible) {
                const seeded = defaultValueForPath(valueType, info.possibleValues);
                setLiteralValue(seeded);
                if (!templateMode) writeFormValue(seeded);
              }
            }
            if (!info.operators.includes(form.watch("operator") || "")) {
              form.setValue("operator", info.operators[0] ?? "");
              form.clearErrors("operator");
            }
          } else {
            setPathInfo(null);
          }
        }}
        error={!!form.formState.errors.target}
        helperText={form.formState.errors.target?.message}
        label="Modifier Path"
      />
      <ModifierOperatorSelect
        value={form.watch("operator") || ""}
        onChange={(nextOperator) => {
          form.setValue("operator", nextOperator);
          form.clearErrors("operator");
        }}
        error={!!form.formState.errors.operator}
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
            error={!!form.formState.errors.value}
            helperText={form.formState.errors.value?.message}
            placeholder={
              pathInfo
                ? pathInfo.valueType === "boolean"
                  ? "true or false"
                  : pathInfo.valueType === "string"
                    ? "text value"
                    : "numeric value"
                : "e.g., 2, -1, 5"
            }
          />
        }
        second={
          <TemplateExpressionInput
            ref={expressionInputRef}
            value={templateExpression}
            onChange={handleExpressionChange}
            rulesetId={rulesetId}
            kind="modifier"
            disabled={!templateMode}
            error={!!form.formState.errors.value}
            helperText={form.formState.errors.value?.message}
          />
        }
      />
    </>
  );
}
