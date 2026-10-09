import { DialogContent, DialogTitle, Stack } from "@mui/material";
import type { UseFormReturn } from "react-hook-form";

import { DialogFooter, EmailField, FormDialog, SelectField } from "@/client/src/components/common/index.ts";
import type { ContributorRole } from "@/shared/enums.ts";

interface InviteContributorDialogProps {
  /** Its opener's, reset as it opens (`EMPTY_INVITE`): a failed invite keeps what was typed. */
  form: UseFormReturn<InviteContributorFormData>;
  onClose: () => void;
  onSubmit: (data: InviteContributorFormData) => void;
  open: boolean;
  pending: boolean;
  /** Roles offered; no role picker when omitted. */
  roles?: ContributorRole[];
}

export interface InviteContributorFormData {
  email: string;
  role: ContributorRole;
}

export function InviteContributorDialog({
  open,
  onClose,
  onSubmit,
  pending,
  roles,
  form,
}: InviteContributorDialogProps) {
  return (
    <FormDialog open={open} onClose={onClose} form={form} pending={pending}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <DialogTitle>Invite Contributor</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ pt: 1 }}>
            <EmailField control={form.control} name="email" autoFocus />
            {roles && <SelectField control={form.control} name="role" label="Role" options={roles} />}
          </Stack>
        </DialogContent>
        <DialogFooter onCancel={onClose} pending={pending} action={{ label: "Invite" }} />
      </form>
    </FormDialog>
  );
}
