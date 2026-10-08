import { Typography } from "@mui/material";
import type { InferResponseType } from "hono/client";

import { ValueChip } from "@/client/src/components/common/index.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import { formatOperator } from "@/shared/customization/operators.ts";
import { extractTemplatePath } from "@/shared/customization/templateExpression.ts";

import { TargetPathBreadcrumbs } from "./TargetPathBreadcrumbs.tsx";

interface ModifierCellProps {
  modifier: ModifierRow;
}

/** A modifier as a table lists it, an entity's or a character's: its target, operator and value, and their labels */
type ModifierRow = Pick<
  InferResponseType<
    (typeof rpc.api.rulesets)[":id"]["customization"][":entityType"][":entityId"]["modifiers"]["$get"],
    200
  >[number],
  "operator" | "target" | "targetLabels" | "value" | "valueLabel"
>;

/** A modifier's operator, in words: a chip */
export function ModifierOperatorCell({ modifier }: ModifierCellProps) {
  return <ValueChip label={formatOperator("modifier", modifier.operator)} color="secondary" />;
}

/** The path a modifier targets: its breadcrumbs */
export function ModifierTargetCell({ modifier }: ModifierCellProps) {
  return <TargetPathBreadcrumbs target={modifier.target} targetLabels={modifier.targetLabels} />;
}

/** A modifier's value: a template's path as breadcrumbs, else the value, named when its path names its values */
export function ModifierValueCell({ modifier }: ModifierCellProps) {
  const templatePath = extractTemplatePath(modifier.value);
  if (templatePath) return <TargetPathBreadcrumbs target={templatePath} targetLabels={modifier.targetLabels} />;
  return <Typography variant="body2">{modifier.valueLabel || modifier.value}</Typography>;
}
