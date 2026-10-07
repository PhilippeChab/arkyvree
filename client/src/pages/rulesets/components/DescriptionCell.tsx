import { Typography } from "@mui/material";

import { EmptyValue } from "@/client/src/components/common/index.ts";
import { lineClampSx } from "@/client/src/theme/text.ts";

interface DescriptionCellProps {
  text: string | null | undefined;
}

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
      {text || <EmptyValue />}
    </Typography>
  );
}
