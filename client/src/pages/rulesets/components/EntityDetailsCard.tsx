import { Stack, Typography } from "@mui/material";
import type { FormEventHandler, ReactNode } from "react";

import {
  CardTitle,
  NO_DESCRIPTION,
  Panel,
  SaveButton,
  useReadOnlyFields,
} from "@/client/src/components/common/index.ts";

interface EntityDetailsCardProps {
  /** An entity with no form, which no one edits (an ability): its description, in its place. */
  description?: string | null;
  /** The entity's form: its fields, and their save. */
  form?: {
    canSave: boolean;
    fields: ReactNode;
    isSaving: boolean;
    onSubmit: FormEventHandler;
  };
  title: string;
}

/**
 * Card at the top of a ruleset entity page: its form, the same whoever reads it. A viewer who can't edit the entity
 * (under `ReadOnlyFields`) reads its fields, read-only, with no Save, which nothing submits.
 */
export function EntityDetailsCard({ title, description, form }: EntityDetailsCardProps) {
  const readOnly = useReadOnlyFields();
  return (
    <Panel spacing={{ xs: 2, sm: 4 }}>
      <CardTitle>{title}</CardTitle>
      {!form && (
        <Typography variant="body1" sx={{ color: "text.secondary", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
          {description || NO_DESCRIPTION}
        </Typography>
      )}
      {form && readOnly && <Stack spacing={3}>{form.fields}</Stack>}
      {form && !readOnly && (
        <Stack component="form" noValidate onSubmit={form.onSubmit} spacing={3}>
          {form.fields}
          <SaveButton canSave={form.canSave} pending={form.isSaving} />
        </Stack>
      )}
    </Panel>
  );
}
