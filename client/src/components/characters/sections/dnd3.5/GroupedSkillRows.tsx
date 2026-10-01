import { ExpandLess } from "@mui/icons-material";
import { IconButton, TableCell, TableRow } from "@mui/material";
import { type ReactNode, useMemo } from "react";

import { useToggleSet } from "@/client/src/hooks/index.ts";

import { groupSkills } from "./skillGroups.ts";

/** Where a skill's row sits: under its group's header, and hidden while that group is collapsed. */
interface SkillPlacement {
  indented: boolean;
  hidden: boolean;
}

interface GroupedSkillRowsProps<S> {
  skills: readonly S[];
  /** The table's column count, which a group's header row spans. */
  columns: number;
  /** The skill's keyed row, usually a `SkillRow`. */
  renderSkill: (skill: S, placement: SkillPlacement) => ReactNode;
}

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
            sx={{ bgcolor: "action.hover", cursor: "pointer" }}
            onClick={() => toggle(row.prefix)}
          >
            <TableCell sx={{ fontWeight: 600 }}>
              {row.prefix} ({row.count})
            </TableCell>
            <TableCell colSpan={columns - 2} />
            <TableCell align="center">
              <IconButton
                size="small"
                aria-label={`${isExpanded ? "Hide" : "Show"} ${row.prefix} skills`}
                sx={{ transition: "transform 200ms", transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)" }}
              >
                <ExpandLess fontSize="small" />
              </IconButton>
            </TableCell>
          </TableRow>
        );
      })}
    </>
  );
}

const fadeInSx = {
  animation: "fadeInRow 200ms ease-out",
  "@keyframes fadeInRow": { from: { opacity: 0 }, to: { opacity: 1 } },
};

interface SkillRowProps extends SkillPlacement {
  name: string;
  /** Wraps the shown name, e.g. in a description tooltip. */
  renderName?: (label: string) => ReactNode;
  /** The row's other cells. */
  children: ReactNode;
}

/** A skill's row. A grouped skill's name drops the group's prefix ("(arcana)") and sits indented. */
export function SkillRow({ name, indented, hidden, renderName = (label) => label, children }: SkillRowProps) {
  const label = indented ? name.replace(/^.+?\s*\(/, "(") : name;
  return (
    <TableRow sx={hidden ? { display: "none" } : indented ? fadeInSx : undefined}>
      <TableCell sx={indented ? { pl: 5 } : undefined}>{renderName(label)}</TableCell>
      {children}
    </TableRow>
  );
}
