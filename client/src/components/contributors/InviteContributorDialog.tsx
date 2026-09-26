import { Button, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, TextField } from "@mui/material";
import { Controller, useForm } from "react-hook-form";

import { DiceSpinner, FormDialog } from "@/client/src/components/common/index.ts";
import { emailRules } from "@/client/src/lib/validation.ts";

export type ContributorRole = "Admin" | "Editor" | "Viewer";

export interface InviteContributorFormData {
  email: string;
  role: ContributorRole;
}

interface InviteContributorDialogProps {
  open: boolean;
  onClose: () => void;
  /** Send the invite and call `onSent` once it succeeds; on failure the typed email stays. */
  onSubmit: (data: InviteContributorFormData, onSent: () => void) => void;
  isLoading: boolean;
  /** Roles offered; no role picker when omitted. */
  roles?: ContributorRole[];
}

export function InviteContributorDialog({ open, onClose, onSubmit, isLoading, roles }: InviteContributorDialogProps) {
  const form = useForm<InviteContributorFormData>({ defaultValues: { email: "", role: "Editor" } });

  const handleClose = () => {
    form.reset();
    onClose();
  };

  return (
    <FormDialog open={open} onClose={handleClose} form={form} isLoading={isLoading}>
      <form
        onSubmit={form.handleSubmit((data) => onSubmit(data, () => form.reset()))}
      >
        <DialogTitle>Invite Contributor</DialogTitle>
        <DialogContent>
          <Controller
            name="email"
            control={form.control}
            rules={emailRules}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="Email address"
                type="email"
                fullWidth
                margin="normal"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                autoFocus
              />
            )}
          />
          {roles && (
            <Controller
              name="role"
              control={form.control}
              render={({ field }) => (
                <FormControl fullWidth margin="normal">
                  <InputLabel>Role</InputLabel>
                  <Select {...field} label="Role">
                    {roles.map((role) => <MenuItem key={role} value={role}>{role}</MenuItem>)}
                  </Select>
                </FormControl>
              )}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={isLoading} variant="outlined" color="inherit">Cancel</Button>
          <Button type="submit" variant="contained" disabled={isLoading}>
            <DiceSpinner size="small" loading={isLoading}>Invite</DiceSpinner>
          </Button>
        </DialogActions>
      </form>
    </FormDialog>
  );
}
