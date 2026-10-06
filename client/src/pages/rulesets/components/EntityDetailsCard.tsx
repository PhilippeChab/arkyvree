import { Box, Button, Card, CardContent, type SxProps, type Theme, Typography } from "@mui/material";
import type { FormEventHandler, ReactNode } from "react";

import { DiceSpinner, NO_DESCRIPTION } from "@/client/src/components/common/index.ts";

interface EntityDetailsCardProps {
  title: string;
  /** Facts shown next to the title in the read-only view. */
  chips?: ReactNode;
  description?: string | null;
  /** Read-only body for entities without a description; replaces it. */
  readOnlyBody?: ReactNode;
  /** The inline edit form, for editors; everyone else sees the description. */
  edit?: {
    fields: ReactNode;
    onSubmit: FormEventHandler;
    canSave: boolean;
    isSaving: boolean;
  };
  sx?: SxProps<Theme>;
}

/** Card at the top of a ruleset entity page: its edit form, or its description. */
export function EntityDetailsCard({ title, chips, description, readOnlyBody, edit, sx }: EntityDetailsCardProps) {
  return (
    <Card
      sx={[{ boxShadow: 2, borderRadius: 2, border: 1, borderColor: "divider" }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      <CardContent sx={{ p: 0 }}>
        <Box sx={{ p: { xs: 2, sm: 3 }, pb: 2, borderBottom: 1, borderColor: "divider", bgcolor: "action.hover" }}>
          <Box
            sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}
          >
            <Typography component="h2" variant="h6" sx={{ fontWeight: 600, color: "primary.main" }}>
              {title}
            </Typography>
            {!edit && chips && <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>{chips}</Box>}
          </Box>
        </Box>
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
          {edit ? (
            <form onSubmit={edit.onSubmit}>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {edit.fields}
                <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
                  <Button type="submit" variant="contained" disabled={!edit.canSave || edit.isSaving}>
                    <DiceSpinner size="small" loading={edit.isSaving}>
                      Save
                    </DiceSpinner>
                  </Button>
                </Box>
              </Box>
            </form>
          ) : (
            (readOnlyBody ?? (
              <Typography variant="body1" sx={{ color: "text.secondary", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {description || NO_DESCRIPTION}
              </Typography>
            ))
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
