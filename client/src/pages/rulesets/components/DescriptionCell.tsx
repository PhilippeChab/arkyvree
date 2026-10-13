import { Box, Typography } from "@mui/material";

import { EmptyValue } from "@/client/src/components/common/index.ts";
import { lineClampSx } from "@/client/src/theme/text.ts";

interface DescriptionCellProps {
  text: string | null | undefined;
}

/** A missing description's dash, which a phone's list item leaves out: its line would say nothing */
const EMPTY_SX = { display: { xs: "none", sm: "inline" } };

/** A section table's description column: secondary text clamped to two lines. */
export function DescriptionCell({ text }: DescriptionCellProps) {
  return (
    <Typography
      variant="body2"
      sx={{
        ...lineClampSx(2),
        color: "text.secondary",
        textOverflow: "ellipsis",
      }}
    >
      {text || (
        <Box component="span" sx={EMPTY_SX}>
          <EmptyValue />
        </Box>
      )}
    </Typography>
  );
}
