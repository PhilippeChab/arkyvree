import { Box, Stack, TableCell, TableRow } from "@mui/material";
import { type ReactNode, useMemo } from "react";

import { CLICKABLE_SX, ExpandArrow, toggleProps } from "@/client/src/components/common/index.ts";
import { useToggleSet } from "@/client/src/hooks/index.ts";
import { DURATION, EASING, fadeIn, PREFERS_REDUCED_MOTION } from "@/client/src/theme/animations.ts";

import { groupSkills } from "./skillGroups.ts";

interface GroupedSkillRowsProps<S> {
  skills: readonly S[];
  /** The table's column count, which a group's header row spans. */
  columns: number;
  /** The skill's keyed row, usually a `SkillRow`. */
  renderSkill: (skill: S, placement: SkillPlacement) => ReactNode;
}

/** Where a skill's row sits: under its group's header, and hidden while that group is collapsed. */
interface SkillPlacement {
  indented: boolean;
  hidden: boolean;
}

interface SkillRowProps extends SkillPlacement {
  name: string;
  /** Wraps the shown name, e.g. in a description tooltip. */
  renderName?: (label: string) => ReactNode;
  /** The row's other cells. */
  children: ReactNode;
}

const FADE_IN_SX = {
  animation: `${fadeIn} ${DURATION.brisk}ms ${EASING.easeOut}`,
  [PREFERS_REDUCED_MOTION]: { animation: "none" },
};

/**
 * A skill table's rows, with the skills that share a prefix ("Knowledge (…)")
 * under a header row whose click shows or hides them.
 */
export function GroupedSkillRows<S extends { name: string }>({
  skills,
  columns,
  renderSkill,
}: GroupedSkillRowsProps<S>) {
  const { keys: expanded, toggle } = useToggleSet();
  const rows = useMemo(() => groupSkills(skills), [skills]);

  return (
    <>
      {rows.map((row) => {
        if (row.type === "skill") {
          const { skill, group } = row;
          return renderSkill(skill, { indented: !!group, hidden: !!group && !expanded.has(group) });
        }
        const isExpanded = expanded.has(row.prefix);
        return (
          <TableRow
            key={`group-${row.prefix}`}
            {...toggleProps(isExpanded, () => toggle(row.prefix), "row")}
            sx={{ ...CLICKABLE_SX, bgcolor: "action.hover" }}
          >
            <TableCell sx={{ fontWeight: 600 }}>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                <ExpandArrow open={isExpanded} />
                <Box component="span">
                  {row.prefix} ({row.count})
                </Box>
              </Stack>
            </TableCell>
            <TableCell colSpan={columns - 1} />
          </TableRow>
        );
      })}
    </>
  );
}

/** A skill's row. A grouped skill's name drops the group's prefix ("(arcana)") and sits indented. */
export function SkillRow({ name, indented, hidden, renderName = (label) => label, children }: SkillRowProps) {
  const label = indented ? name.replace(/^.+?\s*\(/, "(") : name;
  return (
    <TableRow sx={[hidden && { display: "none" }, !hidden && indented && FADE_IN_SX]}>
      <TableCell sx={{ pl: indented ? 5 : undefined }}>{renderName(label)}</TableCell>
      {children}
    </TableRow>
  );
}
