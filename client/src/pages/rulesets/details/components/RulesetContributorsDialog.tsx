import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type InferRequestType, parseResponse } from "hono/client";

import { EditDialog, RowAction, SelectField } from "@/client/src/components/common/index.ts";
import { type Contributor, ContributorsDialog, contributorsQuery } from "@/client/src/components/contributors/index.ts";
import { EditIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDialogState, useFormWith, useRulesetPermissions } from "@/client/src/hooks/index.ts";
import { type RulesetDetail } from "@/client/src/lib/queries.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import type { ContributorRole } from "@/shared/enums.ts";

interface RulesetContributorsDialogProps {
  onClose: () => void;
  open: boolean;
  ruleset: RulesetDetail;
}

/** A contributor's role, as its update sends it. */
type RoleFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["contributors"][":contributorId"]["$put"]
>["json"];

/**
 * A ruleset's contributors (`ContributorsDialog`), whose roles who manages them changes too: an Admin's, the owner
 * alone.
 */
export function RulesetContributorsDialog({ ruleset, open, onClose }: RulesetContributorsDialogProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const { isOwner, canManageContributors } = useRulesetPermissions(ruleset);
  // An archived ruleset refuses invites and role changes, as the server does, but who manages its contributors still
  // removes one, and a contributor still leaves
  const isArchived = ruleset.status === "Archived";
  const canEditRoles = canManageContributors && !isArchived;
  // Only the owner may grant Admin
  const assignableRoles: ContributorRole[] = isOwner ? ["Admin", "Editor", "Viewer"] : ["Editor", "Viewer"];
  // Only the owner can change or remove an Admin
  const outranks = (contributor: Contributor) => isOwner || contributor.role !== "Admin";

  // The contributor whose role is being edited; the role itself lives in roleForm
  const roleDialog = useDialogState<string>();
  const roleForm = useFormWith<RoleFormData>({ role: "Editor" });

  const updateRoleMutation = useMutation({
    mutationFn: ({ contributorId, role }: RoleFormData & { contributorId: string }) =>
      parseResponse(
        rpc.api.rulesets[":id"].contributors[":contributorId"].$put({
          param: { id: ruleset.id, contributorId },
          json: { role },
        }),
      ),
    onSuccess: () => {
      snackbar.success("Role updated");
      void queryClient.invalidateQueries({ queryKey: contributorsQuery("ruleset", ruleset.id).queryKey });
      roleDialog.close();
    },
    onError: (error) => snackbar.error(error, "Failed to update role"),
  });

  return (
    <>
      <ContributorsDialog
        kind="ruleset"
        id={ruleset.id}
        open={open}
        onClose={onClose}
        canInvite={canManageContributors && !isArchived}
        canLeave={!isOwner && !!ruleset.contributorRole}
        canRemove={canManageContributors ? outranks : undefined}
        roles={assignableRoles}
        rowActions={(contributor) =>
          canEditRoles &&
          outranks(contributor) &&
          contributor.status === "Active" && (
            <RowAction
              icon={EditIcon}
              label="Edit Role"
              onClick={() => {
                roleForm.reset({ role: contributor.role });
                roleDialog.openWith(contributor.id);
              }}
            />
          )
        }
      />
      <EditDialog
        open={roleDialog.open}
        onClose={roleDialog.close}
        title="Edit Role"
        form={roleForm}
        onSubmit={({ role }) =>
          roleDialog.target && updateRoleMutation.mutate({ contributorId: roleDialog.target, role })
        }
        pending={updateRoleMutation.isPending}
      >
        <SelectField control={roleForm.control} name="role" label="Role" options={assignableRoles} />
      </EditDialog>
    </>
  );
}
