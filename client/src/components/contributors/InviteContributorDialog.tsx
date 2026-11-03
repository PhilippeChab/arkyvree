import type { InferRequestType } from "hono/client";
import type { UseFormReturn } from "react-hook-form";

import { CreateDialog, EmailField, SelectField } from "@/client/src/components/common/index.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
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

/** An invite's form: a ruleset's invite's body, its role always held (a character's sends its email alone). */
export type InviteContributorFormData = Required<
  InferRequestType<(typeof rpc.api.rulesets)[":id"]["contributors"]["$post"]>["json"]
>;

export function InviteContributorDialog({
  open,
  onClose,
  onSubmit,
  pending,
  roles,
  form,
}: InviteContributorDialogProps) {
  return (
    <CreateDialog
      open={open}
      onClose={onClose}
      title="Invite Contributor"
      form={form}
      onSubmit={onSubmit}
      pending={pending}
      submitLabel="Send Invite"
    >
      <EmailField control={form.control} name="email" autoFocus />
      {roles && <SelectField control={form.control} name="role" label="Role" options={roles} />}
    </CreateDialog>
  );
}
