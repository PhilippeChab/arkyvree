import { Stack } from "@mui/material";

import { TagChip } from "@/client/src/components/common/index.ts";
import { ChevronRightIcon } from "@/client/src/components/icons/index.ts";
import { formatSegment } from "@/shared/customization/target.ts";

interface TargetPathBreadcrumbsProps {
  target: string;
  targetLabels?: Record<string, string>;
}

export function TargetPathBreadcrumbs({ target, targetLabels }: TargetPathBreadcrumbsProps) {
  const segments = target.split(".").filter(Boolean);

  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", flexWrap: "nowrap", overflow: "hidden" }}>
      {segments.map((segment, index) => (
        <Stack key={index} direction="row" sx={{ alignItems: "center" }}>
          {index > 0 && <ChevronRightIcon fontSize="compact" sx={{ color: "text.secondary", mx: 0.25 }} />}
          <TagChip tag={{ label: targetLabels?.[segment] ?? formatSegment(segment), color: "primary" }} />
        </Stack>
      ))}
    </Stack>
  );
}
