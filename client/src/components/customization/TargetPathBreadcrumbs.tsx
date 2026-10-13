import { Stack, type Theme } from "@mui/material";
import type { ComponentProps, ReactNode } from "react";

import { ValueChip } from "@/client/src/components/common/index.ts";
import { ChevronRightIcon } from "@/client/src/components/icons/index.ts";
import { formatSegment } from "@/shared/customization/target.ts";

interface TargetPathBreadcrumbsProps {
  /** What follows its last segment, on its line: the path browser's Clear, or its note while no path is picked */
  children?: ReactNode;
  /** Its chips': a picker's says whether its path is complete */
  color?: ComponentProps<typeof ValueChip>["color"];
  /** Picks the path up to a segment, by its index: each chip a step back, in a picker */
  onSegmentClick?: (index: number) => void;
  target: string;
  targetLabels?: Record<string, string>;
  /** Its segments wrap onto more lines, in a picker; elsewhere (a table's cell) they keep to one from `sm` up, a phone wrapping them */
  wrap?: boolean;
}

/** A segment's chevron, before its chip */
const CHEVRON_SX = { fontSize: 16, color: "text.secondary" };

/** After its chip, on a phone alone, ending its line when the path wraps */
const CHEVRON_AFTER_SX = { ...CHEVRON_SX, display: { xs: "inline-block", sm: "none" } };

/** Before its chip from `sm` up; on a phone, the chevron goes after the chip before, so a wrapped line starts with a chip */
const CHEVRON_BEFORE_SX = { ...CHEVRON_SX, display: { xs: "none", sm: "inline-block" } };

/** On a phone, a segment's chip as wide as its line at most, its label wrapping inside it rather than cut */
function phoneWrappedChipsSx(theme: Theme) {
  return {
    [theme.breakpoints.down("sm")]: {
      // Its wrapped lines apart, as a list's lines are; a chip's chevron after it, as close to the next chip
      rowGap: 1,
      columnGap: 0.25,
      "& > *": { minWidth: 0, maxWidth: "100%" },
      "& .MuiChip-root": { height: "auto", minHeight: 24, minWidth: 0, flexShrink: 1 },
      "& .MuiChip-label": { whiteSpace: "normal", overflowWrap: "anywhere" },
    },
  };
}

/** A target path's segments, each a chip after a chevron: in a list's cell, a modifier's page and the path picker */
export function TargetPathBreadcrumbs({
  target,
  targetLabels,
  color = "primary",
  onSegmentClick,
  wrap = false,
  children,
}: TargetPathBreadcrumbsProps) {
  const segments = target.split(".").filter(Boolean);

  return (
    // A segment's chevron sits a quarter unit from its chip, three from the chip before
    <Stack
      direction="row"
      spacing={0.75}
      sx={[
        { alignItems: "center" },
        wrap
          ? { flexWrap: "wrap", rowGap: 0.5, minHeight: 32 }
          : { flexWrap: { xs: "wrap", sm: "nowrap" }, rowGap: 0.5, overflow: { sm: "hidden" } },
        !wrap && phoneWrappedChipsSx,
      ]}
    >
      {segments.map((segment, index) => (
        <Stack key={index} direction="row" spacing={0.25} sx={{ alignItems: "center" }}>
          {index > 0 && <ChevronRightIcon sx={wrap ? CHEVRON_SX : CHEVRON_BEFORE_SX} />}
          <ValueChip
            label={targetLabels?.[segment] || formatSegment(segment)}
            color={color}
            onClick={onSegmentClick && (() => onSegmentClick(index))}
          />
          {!wrap && index < segments.length - 1 && <ChevronRightIcon sx={CHEVRON_AFTER_SX} />}
        </Stack>
      ))}
      {children}
    </Stack>
  );
}
