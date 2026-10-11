import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type InferRequestType, parseResponse } from "hono/client";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDialogState, useFormWith } from "@/client/src/hooks/index.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import { type RulesetDetail } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import type { EditRulesetFormData, ForkRulesetFormData } from "@/client/src/pages/rulesets/details/components/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** An extension a ruleset unsubscribes from, and the ruleset. */
interface UnsubscribeTarget {
  extensionId: string;
  extensionName: string;
  rulesetId: string;
}
/** Published as a base ruleset or as an extension. */
export type PublishKind = NonNullable<
  InferRequestType<(typeof rpc.api.rulesets)[":id"]["publish"]["$post"]>["json"]["kind"]
>;

export function useRulesetOperations() {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const navigate = useNavigate();

  // Each dialog keeps the ruleset (or the extension) it acts on while it fades out
  const editDialog = useDialogState<RulesetDetail>();
  const forkDialog = useDialogState<RulesetDetail>();
  const archiveDialog = useDialogState<RulesetDetail>();
  const publishDialog = useDialogState<RulesetDetail>();
  const [publishKind, setPublishKind] = useState<PublishKind>("ruleset");
  const subscribeDialog = useDialogState<RulesetDetail>();
  const unsubscribeDialog = useDialogState<UnsubscribeTarget>();

  /**
   * Refetches a ruleset and the lists that show it: the ruleset itself after an edit, an archive or a publish, which
   * leave its sections as they were, and every section with it once its extensions change (`withContent`), whose
   * content joins or leaves each of them.
   */
  const refreshRuleset = (id: string, withContent = false) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.rulesets.detail(id), exact: !withContent }),
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.rulesets.lists }),
    ]);

  const editForm = useFormWith<EditRulesetFormData>({ name: "", description: "", private: false });
  // A fork starts private: once public, a ruleset can't be made private again
  const forkForm = useFormWith<ForkRulesetFormData>({ name: "", description: "", private: true });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data, updatedAt }: { data: EditRulesetFormData; id: string; updatedAt?: string }) =>
      parseResponse(
        rpc.api.rulesets[":id"].$put({
          param: { id },
          json: { ...data, updatedAt },
        }),
      ),
    onSuccess: (_, { id }) => {
      snackbar.success("Ruleset updated");
      void refreshRuleset(id);
      editDialog.close();
    },
    onError: (error) => {
      snackbar.error(error, "Failed to update ruleset");
    },
  });

  const forkMutation = useMutation({
    mutationFn: async ({ id, data }: { data: ForkRulesetFormData; id: string }) =>
      parseResponse(
        rpc.api.rulesets[":id"].fork.$post({
          param: { id },
          json: data,
        }),
      ),
    onSuccess: (data) => {
      snackbar.success("Ruleset forked");
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.rulesets.lists,
      });
      forkDialog.close();
      navigate(`/rulesets/${data.id}`);
    },
    onError: (error) => {
      snackbar.error(error, "Failed to fork ruleset");
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) =>
      parseResponse(
        rpc.api.rulesets[":id"].archive.$post({
          param: { id },
        }),
      ),
    onSuccess: (_, id) => {
      snackbar.success("Ruleset archived");
      void refreshRuleset(id);
      archiveDialog.close();
    },
    onError: (error) => {
      snackbar.error(error, "Failed to archive ruleset");
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: async (id: string) =>
      parseResponse(
        rpc.api.rulesets[":id"].unarchive.$post({
          param: { id },
        }),
      ),
    onSuccess: (_, id) => {
      snackbar.success("Ruleset unarchived");
      void refreshRuleset(id);
    },
    onError: (error) => {
      snackbar.error(error, "Failed to unarchive ruleset");
    },
  });

  const publishMutation = useMutation({
    mutationFn: async ({ id, kind }: { id: string; kind?: PublishKind }) =>
      parseResponse(
        rpc.api.rulesets[":id"].publish.$post({
          param: { id },
          json: { kind },
        }),
      ),
    onSuccess: (_, { id }) => {
      snackbar.success("Ruleset published");
      void refreshRuleset(id);
      publishDialog.close();
    },
    onError: (error) => {
      snackbar.error(error, "Failed to publish ruleset");
    },
  });

  const subscribeMutation = useMutation({
    mutationFn: async ({ id, extensionIds }: { extensionIds: string[]; id: string }) =>
      parseResponse(
        rpc.api.rulesets[":id"].subscribe.$post({
          param: { id },
          json: { extensionIds },
        }),
      ),
    onSuccess: (_, { id, extensionIds }) => {
      snackbar.success(
        `Subscribed to ${extensionIds.length === 1 ? "extension" : formatCount(extensionIds.length, "extension")}`,
      );
      subscribeDialog.close();
      void refreshRuleset(id, true);
    },
    onError: (error) => {
      snackbar.error(error, "Failed to subscribe to extension");
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: async ({ id, extensionId }: { extensionId: string; id: string }) =>
      parseResponse(
        rpc.api.rulesets[":id"].unsubscribe.$post({
          param: { id },
          json: { extensionId },
        }),
      ),
    onSuccess: (_, { id }) => {
      snackbar.success("Unsubscribed from extension");
      unsubscribeDialog.close();
      void refreshRuleset(id, true);
    },
    onError: (error) => {
      snackbar.error(error, "Failed to unsubscribe from extension");
    },
  });

  const handleEdit = (ruleset: RulesetDetail) => {
    editForm.reset({
      name: ruleset.name,
      description: ruleset.description,
      private: ruleset.private,
      kind: ruleset.kind,
    });
    editDialog.openWith(ruleset);
  };

  const handleFork = (ruleset: RulesetDetail) => {
    forkForm.reset({
      name: `${ruleset.name} (Fork)`,
      description: ruleset.description,
      private: true,
    });
    forkDialog.openWith(ruleset);
  };

  const handleArchive = (ruleset: RulesetDetail) => archiveDialog.openWith(ruleset);

  const handlePublish = (ruleset: RulesetDetail) => {
    setPublishKind(ruleset.kind ?? "ruleset");
    publishDialog.openWith(ruleset);
  };

  const handleSubscribe = (ruleset: RulesetDetail) => subscribeDialog.openWith(ruleset);

  const confirmSubscribe = (extensionIds: string[]) => {
    if (subscribeDialog.target) subscribeMutation.mutate({ id: subscribeDialog.target.id, extensionIds });
  };

  const handleUnsubscribe = (rulesetId: string, extensionId: string, extensionName: string) =>
    unsubscribeDialog.openWith({ rulesetId, extensionId, extensionName });

  const confirmUnsubscribe = () => {
    const target = unsubscribeDialog.target;
    if (target) unsubscribeMutation.mutate({ id: target.rulesetId, extensionId: target.extensionId });
  };

  const confirmFork = (data: ForkRulesetFormData) => {
    if (forkDialog.target) forkMutation.mutate({ id: forkDialog.target.id, data });
  };

  return {
    /** Each dialog: `open`, `close`, and what it acts on (`target`). */
    editDialog,
    forkDialog,
    archiveDialog,
    publishDialog,
    publishKind,
    setPublishKind,
    subscribeDialog,
    unsubscribeDialog,

    editForm,
    forkForm,

    updateMutation,
    forkMutation,
    archiveMutation,
    unarchiveMutation,
    publishMutation,
    subscribeMutation,
    unsubscribeMutation,

    handleEdit,
    handleFork,
    handleArchive,
    handlePublish,
    handleSubscribe,
    handleUnsubscribe,
    confirmFork,
    confirmSubscribe,
    confirmUnsubscribe,
  };
}
