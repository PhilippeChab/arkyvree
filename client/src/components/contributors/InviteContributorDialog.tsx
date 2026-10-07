import { Button, DialogActions, DialogContent, DialogTitle } from "@mui/material";
import type { InferRequestType } from "hono/client";

import { DiceSpinner, EmailField, FormDialog, SelectField } from "@/client/src/components/common/index.ts";
import { useFormWith } from "@/client/src/hooks/index.ts";
import { EMAIL_RULES } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

interface InviteContributorDialogProps {
  open: boolean;
  onClose: () => void;
  /** Send the invite and call `onSent` once it succeeds; on failure the typed email stays. */
  onSubmit: (data: InviteContributorFormData, onSent: () => void) => void;
  isLoading: boolean;
  /** Roles offered; no role picker when omitted. */
  roles?: ContributorRole[];
}

export type ContributorRole = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["contributors"][":contributorId"]["$put"]
>["json"]["role"];

export interface InviteContributorFormData {
  email: string;
  role: ContributorRole;
}

export function InviteContributorDialog({ open, onClose, onSubmit, isLoading, roles }: InviteContributorDialogProps) {
  const form = useFormWith<InviteContributorFormData>({ email: "", role: "Editor" });

  const handleClose = () => {
    form.reset();
    onClose();
  };

  return (
    <FormDialog open={open} onClose={handleClose} form={form} isLoading={isLoading}>
      <form onSubmit={form.handleSubmit((data) => onSubmit(data, () => form.reset()))} noValidate>
        <DialogTitle>Invite Contributor</DialogTitle>
        <DialogContent>
          <EmailField control={form.control} name="email" rules={EMAIL_RULES} label="Email address" autoFocus />
          {roles && <SelectField control={form.control} name="role" label="Role" options={roles} margin="normal" />}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={isLoading} variant="outlined" color="inherit">
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={isLoading}>
            <DiceSpinner size="small" loading={isLoading}>
              Invite
            </DiceSpinner>
          </Button>
        </DialogActions>
      </form>
    </FormDialog>
  );
}
