import { Chip, Stack } from "@mui/material";

import { ChevronRightIcon } from "@/client/src/components/icons/index.ts";
import { formatSegment } from "@/shared/customization/target.ts";

interface TargetPathBreadcrumbsProps {
  target: string;
  targetLabels?: Record<string, string>;
}

export function TargetPathBreadcrumbs({ target, targetLabels }: TargetPathBreadcrumbsProps) {
  const segments = target.split(".").filter(Boolean);

  return (
    // A segment's chevron sits a quarter unit from its chip, three from the chip before
    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "nowrap", overflow: "hidden" }}>
      {segments.map((segment, index) => (
        <Stack key={index} direction="row" spacing={0.25} sx={{ alignItems: "center" }}>
          {index > 0 && <ChevronRightIcon sx={{ fontSize: 16, color: "text.secondary" }} />}
          <Chip
            label={targetLabels?.[segment] ?? formatSegment(segment)}
            size="small"
            variant="outlined"
            color="primary"
          />
        </Stack>
      ))}
    </Stack>
  );
}
