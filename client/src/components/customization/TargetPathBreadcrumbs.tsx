import { Box, Chip } from "@mui/material";

import { ChevronRightIcon } from "@/client/src/components/icons/index.ts";
import { formatSegment } from "@/shared/customization/target.ts";

interface TargetPathBreadcrumbsProps {
  target: string;
  targetLabels?: Record<string, string>;
}

export function TargetPathBreadcrumbs({ target, targetLabels }: TargetPathBreadcrumbsProps) {
  const segments = target.split(".").filter(Boolean);

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "nowrap", overflow: "hidden" }}>
      {segments.map((segment, index) => (
        <Box key={index} sx={{ display: "flex", alignItems: "center" }}>
          {index > 0 && <ChevronRightIcon sx={{ fontSize: 16, color: "text.secondary", mx: 0.25 }} />}
          <Chip
            label={targetLabels?.[segment] ?? formatSegment(segment)}
            size="small"
            variant="outlined"
            color="primary"
          />
        </Box>
      ))}
    </Box>
  );
}
