import { Box, Stack } from "@mui/material";
import type { ReactNode } from "react";

import { CLICKABLE_ROW_SX, DataCell, DataRow, ExpandArrow, toggleProps } from "@/client/src/components/common/index.ts";
import { useToggleSet } from "@/client/src/hooks/index.ts";
import { DURATION, EASING, fadeIn, PREFERS_REDUCED_MOTION } from "@/client/src/theme/animations.ts";

import { groupRows } from "./rowGroups.ts";

interface GroupedRowProps extends RowPlacement {
  /** The row's other cells. */
  children: ReactNode;
  name: string;
  /** Wraps the shown name, e.g. in a description tooltip. */
  renderName?: (label: string) => ReactNode;
  /** Its name within its family, as its rules give it ("arcana"), which it shows under its group */
  shortName: string;
}

interface GroupedRowsProps<R> {
  /** The table's column count, which a group's header row spans. */
  columns: number;
  /** A row's keyed row, usually a `GroupedRow`, whose other cells are `DataCell`s. */
  renderRow: (row: R, placement: RowPlacement) => ReactNode;
  rows: readonly R[];
}

/** Where a row sits: under its group's header, and hidden while that group is collapsed. */
interface RowPlacement {
  hidden: boolean;
  indented: boolean;
}

const FADE_IN_SX = {
  animation: `${fadeIn} ${DURATION.brisk}ms ${EASING.easeOut}`,
  [PREFERS_REDUCED_MOTION]: { animation: "none" },
};

/** A group's name, bolder than its rows', a phone's too */
const GROUP_NAME_SX = { fontWeight: { xs: 600 } };

/**
 * A grouped table's row. One in a group shows its name within its family (`shortName`: "arcana"; "(alchemy) -
 * Masterwork"), and sits indented.
 */
export function GroupedRow({
  name,
  indented,
  hidden,
  renderName = (label) => label,
  shortName,
  children,
}: GroupedRowProps) {
  const label = indented ? shortName : name;
  return (
    <DataRow hidden={hidden} indented={indented} sx={[!hidden && indented && FADE_IN_SX]}>
      <DataCell slot="primary" sx={{ pl: indented ? 5 : undefined }}>
        {renderName(label)}
      </DataCell>
      {children}
    </DataRow>
  );
}

/**
 * A table's rows, with those of a family two or more share, as their rules name it (3.5's skills' "Knowledge"), under
 * a header row whose click shows or hides them.
 */
export function GroupedRows<R extends { family: string | null }>({ rows, columns, renderRow }: GroupedRowsProps<R>) {
  const { keys: expanded, toggle } = useToggleSet();
  const grouped = groupRows(rows);

  return (
    <>
      {grouped.map((row) => {
        if (row.type === "row") {
          const { group } = row;
          return renderRow(row.row, { indented: !!group, hidden: !!group && !expanded.has(group) });
        }
        const isExpanded = expanded.has(row.prefix);
        return (
          <DataRow
            key={`group-${row.prefix}`}
            {...toggleProps(isExpanded, () => toggle(row.prefix), "row")}
            sx={[CLICKABLE_ROW_SX, { bgcolor: "action.hover" }]}
          >
            <DataCell slot="primary" sx={GROUP_NAME_SX}>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                <ExpandArrow open={isExpanded} />
                <Box component="span">
                  {row.prefix} ({row.count})
                </Box>
              </Stack>
            </DataCell>
            <DataCell slot="hidden" colSpan={columns - 1} />
          </DataRow>
        );
      })}
    </>
  );
}
