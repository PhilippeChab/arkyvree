import { Stack, Typography } from "@mui/material";
import type { FormEventHandler, ReactNode } from "react";

import { CardTitle, NO_DESCRIPTION, Panel, SaveButton } from "@/client/src/components/common/index.ts";

interface EntityDetailsCardProps {
  /** Facts shown next to the title in the read-only view: chips alone */
  chips?: ReactNode;
  description?: string | null;
  /** The inline edit form, for editors; everyone else sees the description. */
  edit?: {
    canSave: boolean;
    fields: ReactNode;
    isSaving: boolean;
    onSubmit: FormEventHandler;
  };
  /** What failed to load for the read-only view (a `LoadError`), stated above its body */
  notice?: ReactNode;
  /** Read-only body for entities without a description; replaces it. */
  readOnlyBody?: ReactNode;
  title: string;
}

/** Card at the top of a ruleset entity page: its edit form, or its description. */
export function EntityDetailsCard({ title, chips, description, notice, readOnlyBody, edit }: EntityDetailsCardProps) {
  return (
    <Panel spacing={{ xs: 2, sm: 4 }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}
      >
        <CardTitle>{title}</CardTitle>
        {!edit && chips && (
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
            {chips}
          </Stack>
        )}
      </Stack>
      {edit ? (
        <Stack component="form" noValidate onSubmit={edit.onSubmit} spacing={3}>
          {edit.fields}
          <SaveButton canSave={edit.canSave} pending={edit.isSaving} />
        </Stack>
      ) : (
        <Stack spacing={2}>
          {notice}
          {readOnlyBody ?? (
            <Typography variant="body1" sx={{ color: "text.secondary", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {description || NO_DESCRIPTION}
            </Typography>
          )}
        </Stack>
      )}
    </Panel>
  );
}
