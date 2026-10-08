import { Stack } from "@mui/material";
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
  /** Its segments wrap onto more lines, in a picker; a table's cell keeps them on one */
  wrap?: boolean;
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
        wrap ? { flexWrap: "wrap", rowGap: 0.5, minHeight: 32 } : { flexWrap: "nowrap", overflow: "hidden" },
      ]}
    >
      {segments.map((segment, index) => (
        <Stack key={index} direction="row" spacing={0.25} sx={{ alignItems: "center" }}>
          {index > 0 && <ChevronRightIcon sx={{ fontSize: 16, color: "text.secondary" }} />}
          <ValueChip
            label={targetLabels?.[segment] || formatSegment(segment)}
            color={color}
            onClick={onSegmentClick && (() => onSegmentClick(index))}
          />
        </Stack>
      ))}
      {children}
    </Stack>
  );
}
