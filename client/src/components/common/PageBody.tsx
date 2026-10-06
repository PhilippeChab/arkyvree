import { Container, Stack } from "@mui/material";
import type { ReactNode } from "react";

import { PageTransition } from "./PageTransition.tsx";

interface PageBodyProps {
  /** How wide its column reads: `xl` for lists and records, `lg` for an account's pages, `md` for a document, `sm` for one card */
  width?: "xl" | "lg" | "md" | "sm";
  children: ReactNode;
}

/** A page's frame: it fades in, centers its column at its width, and stacks its blocks `spacing={4}` apart. */
export function PageBody({ width = "xl", children }: PageBodyProps) {
  return (
    <PageTransition>
      <Container maxWidth={width} sx={{ py: { xs: 2, sm: 4 } }}>
        <Stack spacing={4}>{children}</Stack>
      </Container>
    </PageTransition>
  );
}
