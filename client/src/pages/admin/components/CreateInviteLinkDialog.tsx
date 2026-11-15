import { DialogContentText } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type InferRequestType, type InferResponseType, parseResponse } from "hono/client";

import { CreateDialog, SelectField } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormWith } from "@/client/src/hooks/index.ts";
import { APP_NAME } from "@/client/src/lib/brand.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { DEFAULT_INVITE_LINK_LIFETIME_IN_DAYS, INVITE_LINK_LIFETIMES_IN_DAYS } from "@/shared/inviteLinks.ts";

interface CreateInviteLinkDialogProps {
  onClose: () => void;
  onCreated: (link: CreatedInviteLink) => void;
  onExited: () => void;
  open: boolean;
}

/** A new link's lifetime, as its create sends it. */
type InviteLinkRequest = InferRequestType<(typeof rpc.api.admin)["invite-links"]["$post"]>["json"];

/** A new link, as its create answers it: its token among its fields, shown this once. */
export type CreatedInviteLink = InferResponseType<(typeof rpc.api.admin)["invite-links"]["$post"], 201>;

/** A link's lifetimes, as its form offers them: a day, a week, a month. */
const LIFETIME_OPTIONS = INVITE_LINK_LIFETIMES_IN_DAYS.map((days) => ({
  value: days,
  label: days === 1 ? "1 Day" : `${days} Days`,
}));

/** Makes an invite link that lasts the admin's choice of a day, a week or a month, then hands it on to show it. */
export function CreateInviteLinkDialog({ open, onClose, onCreated, onExited }: CreateInviteLinkDialogProps) {
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const form = useFormWith<InviteLinkRequest>({ expiresInDays: DEFAULT_INVITE_LINK_LIFETIME_IN_DAYS });

  const createMutation = useMutation({
    mutationFn: (json: InviteLinkRequest) => parseResponse(rpc.api.admin["invite-links"].$post({ json })),
    onSuccess: (link) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.admin.inviteLinks });
      snackbar.success("Invite link created");
      onCreated(link);
    },
    onError: (error) => snackbar.error(error, "Failed to create the invite link"),
  });

  return (
    <CreateDialog
      open={open}
      onClose={onClose}
      onExited={onExited}
      title="Create Invite Link"
      form={form}
      onSubmit={(data) => createMutation.mutate(data)}
      pending={createMutation.isPending}
    >
      <DialogContentText>
        Anyone who opens the link can make an account on this {APP_NAME} until it expires or you revoke it, while
        sign-ups are Open or Invite Only. Share it with the people you mean to let in, such as your group's chat.
      </DialogContentText>
      <SelectField
        control={form.control}
        name="expiresInDays"
        label="Expires After"
        options={LIFETIME_OPTIONS}
        disabled={createMutation.isPending}
      />
    </CreateDialog>
  );
}
