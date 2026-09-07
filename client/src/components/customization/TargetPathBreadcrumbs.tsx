import { formatSegment } from "@/shared/utils.ts";
import ChevronRight from "@mui/icons-material/ChevronRight";
import { Box, Chip } from "@mui/material";

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
          {index > 0 && (
            <ChevronRight
              sx={{ fontSize: 16, color: "text.secondary", mx: 0.25 }}
            />
          )}
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
