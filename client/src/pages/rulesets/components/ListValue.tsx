import { Typography } from "@mui/material";

import { EmptyValue, StatusChip, ValueChip } from "@/client/src/components/common/index.ts";
import { formatDecimal } from "@/client/src/lib/formatNumeric.ts";
import type { RulesDescription } from "@/client/src/lib/queries.ts";
import { isRecord } from "@/shared/isRecord.ts";

import { LinkChipsCell } from "./LinkChipsCell.tsx";

interface ListValueProps {
  column: ListColumn;
  /** The listed entity, as its list's endpoint sends it */
  entity: object;
  /** The names of the entities a reference column names, by id (`useEntityList`'s) */
  names: ReadonlyMap<string, string>;
}

/** A list's column of an entity's own value, as its rules describe it. */
type ListColumn = NonNullable<RulesDescription["lists"][string]>["columns"][number];

/** An entity's value at a key, none where it has none. */
function valueOf(entity: object, key: string): unknown {
  return isRecord(entity) ? entity[key] : undefined;
}

/**
 * An entity's value in its type's list, as its column says it reads (`ListColumn.reads`): a chip of its label, its
 * text as it is or quiet, a number or a decimal in its unit, the name of the entity it names, a flag's warning, a
 * template, the pools it's picked in; "—" for none.
 */
export function ListValue({ column, entity, names }: ListValueProps) {
  const value = valueOf(entity, column.key);
  const unit = column.unit ? ` ${column.unit}` : "";
  switch (column.reads) {
    case "chip":
      if (value === null || value === undefined || value === "") return <EmptyValue />;
      return <ValueChip label={column.labels?.[String(value)] ?? String(value)} />;
    case "text":
      return typeof value === "string" && value ? value : <EmptyValue />;
    case "muted":
      return (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {typeof value === "string" && value ? value : <EmptyValue />}
        </Typography>
      );
    case "number":
      return <Typography variant="body2">{typeof value === "number" ? `${value}${unit}` : <EmptyValue />}</Typography>;
    case "decimal": {
      const decimal = typeof value === "number" || typeof value === "string" ? formatDecimal(value) : null;
      return <Typography variant="body2">{decimal === null ? <EmptyValue /> : `${decimal}${unit}`}</Typography>;
    }
    case "reference": {
      const name = typeof value === "string" ? names.get(value) : undefined;
      return name ? <ValueChip label={name} /> : <EmptyValue />;
    }
    case "flag":
      return value === column.yesWhen ? (
        <StatusChip label="Yes" color="warning" />
      ) : (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          No
        </Typography>
      );
    case "template": {
      if (valueOf(entity, "isTemplate") === true) return <StatusChip label="Template" color="info" />;
      const templateName = valueOf(entity, "templateName");
      if (typeof templateName === "string" && templateName) {
        return (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {templateName}
          </Typography>
        );
      }
      return <EmptyValue />;
    }
    case "pools": {
      const links = valueOf(entity, column.key);
      return <LinkChipsCell links={Array.isArray(links) ? links : undefined} target={column.target} />;
    }
  }
}
