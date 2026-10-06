import { Box, Button, Card, CardContent, Stack, Typography } from "@mui/material";
import type { FormEventHandler, ReactNode } from "react";

import { DiceSpinner, FormActions, NO_DESCRIPTION } from "@/client/src/components/common/index.ts";

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
}

/** Card at the top of a ruleset entity page: its edit form, or its description. */
export function EntityDetailsCard({ title, chips, description, readOnlyBody, edit }: EntityDetailsCardProps) {
  return (
    <Card sx={{ borderRadius: 2 }}>
      <CardContent sx={{ p: 0 }}>
        <Box sx={{ p: { xs: 2, sm: 3 }, pb: 2, borderBottom: 1, borderColor: "divider", bgcolor: "action.hover" }}>
          <Stack
            direction="row"
            spacing={1}
            sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}
          >
            <Typography component="h2" variant="h6" sx={{ fontWeight: 600, color: "primary.main" }}>
              {title}
            </Typography>
            {!edit && chips && (
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                {chips}
              </Stack>
            )}
          </Stack>
        </Box>
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
          {edit ? (
            <Stack component="form" spacing={3} onSubmit={edit.onSubmit} noValidate>
              {edit.fields}
              <FormActions>
                <Button type="submit" variant="contained" disabled={!edit.canSave || edit.isSaving}>
                  <DiceSpinner size="small" loading={edit.isSaving}>
                    Save
                  </DiceSpinner>
                </Button>
              </FormActions>
            </Stack>
          ) : (
            (readOnlyBody ?? (
              <Typography sx={{ color: "text.secondary", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {description || NO_DESCRIPTION}
              </Typography>
            ))
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
