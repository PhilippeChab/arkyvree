import { TableCell, TableRow } from "@mui/material";
import { type ReactNode, useMemo } from "react";

import { CLICKABLE_SX, ExpandArrow, toggleProps } from "@/client/src/components/common/index.ts";
import { useToggleSet } from "@/client/src/hooks/index.ts";
import { ANIMATIONS } from "@/client/src/lib/animations.ts";

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

const fadeInSx = { animation: ANIMATIONS.fadeIn };

/**
 * A skill table's rows, with the skills that share a prefix ("Knowledge (…)")
 * under a header row whose click shows or hides them.
 */
export function GroupedSkillRows<S extends { name: string }>({
  skills,
  columns,
  renderSkill,
}: GroupedSkillRowsProps<S>) {
  const [expanded, toggle] = useToggleSet();
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
            sx={{ bgcolor: "action.hover", ...CLICKABLE_SX }}
          >
            <TableCell sx={{ fontWeight: "fontWeightBold" }}>
              {row.prefix} ({row.count})
            </TableCell>
            <TableCell colSpan={columns - 2} />
            <TableCell align="center">
              <ExpandArrow open={isExpanded} />
            </TableCell>
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
    <TableRow sx={hidden ? { display: "none" } : indented ? fadeInSx : undefined}>
      <TableCell sx={indented ? { pl: 6 } : undefined}>{renderName(label)}</TableCell>
      {children}
    </TableRow>
  );
}
