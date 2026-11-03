import { Box, Stack } from "@mui/material";
import type { ReactNode } from "react";

import { CardTitle, Panel } from "@/client/src/components/common/index.ts";

interface SheetSectionProps {
  /** Controls shown beside the title, e.g. an Add button. */
  action?: ReactNode;
  children: ReactNode;
  title: string;
}

/** Titled panel of the character sheet. */
export function SheetSection({ title, action, children }: SheetSectionProps) {
  return (
    <Panel spacing={3}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}
      >
        <CardTitle>{title}</CardTitle>
        {action}
      </Stack>
      <Box>{children}</Box>
    </Panel>
  );
}
