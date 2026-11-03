import { Stack, Typography } from "@mui/material";

import { BlankNote } from "@/client/src/components/common/index.ts";

import { BlockTable } from "./BlockTable.tsx";
import type { BlockOf } from "./sheetBlocks.ts";
import { SheetSection } from "./SheetSection.tsx";

interface TableSectionProps {
  block: BlockOf<"table">;
}

/** A `table` block: its note above its table (3.5's skills: "* indicates a class skill"). */
export function TableSection({ block }: TableSectionProps) {
  return (
    <SheetSection title={block.title}>
      {block.table.rows.length > 0 ? (
        <Stack spacing={2}>
          {block.note && (
            <Typography variant="body2" sx={{ color: "text.secondary", fontStyle: "italic" }}>
              {block.note}
            </Typography>
          )}
          <BlockTable table={block.table} />
        </Stack>
      ) : (
        <BlankNote>{block.empty}</BlankNote>
      )}
    </SheetSection>
  );
}
