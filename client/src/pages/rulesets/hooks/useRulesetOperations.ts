import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type InferRequestType, parseResponse } from "hono/client";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormWith } from "@/client/src/hooks/index.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import type { RulesetListItem } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import type { EditRulesetFormData, ForkRulesetFormData } from "@/client/src/pages/rulesets/details/components/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { useToggleRulesetStar } from "./useToggleRulesetStar.ts";

type Ruleset = RulesetListItem;
/** Published as a base ruleset or as an extension. */
export type PublishKind = NonNullable<
  InferRequestType<(typeof rpc.api.rulesets)[":id"]["publish"]["$post"]>["json"]["kind"]
>;

export function useRulesetOperations() {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const navigate = useNavigate();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [forkDialogOpen, setForkDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishKind, setPublishKind] = useState<PublishKind>("ruleset");
  const [subscribeDialogOpen, setSubscribeDialogOpen] = useState(false);
  const [unsubscribeDialogOpen, setUnsubscribeDialogOpen] = useState(false);
  const [unsubscribeTarget, setUnsubscribeTarget] = useState<{
    extensionId: string;
    extensionName: string;
    rulesetId: string;
  } | null>(null);

  const [selectedRuleset, setSelectedRuleset] = useState<Ruleset | null>(null);

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
  const forkForm = useFormWith<ForkRulesetFormData>({ name: "", description: "", private: false });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data, updatedAt }: { data: EditRulesetFormData; id: string; updatedAt?: string }) => {
      return parseResponse(
        rpc.api.rulesets[":id"].$put({
          param: { id },
          json: { ...data, updatedAt },
        }),
      );
    },
    onSuccess: (_, { id }) => {
      snackbar.success("Ruleset updated");
      void refreshRuleset(id);
      setEditDialogOpen(false);
    },
    onError: (error) => {
      snackbar.error(error, "Failed to update ruleset");
    },
  });

  const forkMutation = useMutation({
    mutationFn: async ({ id, data }: { data: ForkRulesetFormData; id: string }) => {
      return parseResponse(
        rpc.api.rulesets[":id"].fork.$post({
          param: { id },
          json: data,
        }),
      );
    },
    onSuccess: (data) => {
      snackbar.success("Ruleset forked");
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.rulesets.lists,
      });
      setForkDialogOpen(false);
      navigate(`/rulesets/${data.id}`);
    },
    onError: (error) => {
      snackbar.error(error, "Failed to fork ruleset");
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      return parseResponse(
        rpc.api.rulesets[":id"].archive.$post({
          param: { id },
        }),
      );
    },
    onSuccess: (_, id) => {
      snackbar.success("Ruleset archived");
      void refreshRuleset(id);
      setArchiveDialogOpen(false);
    },
    onError: (error) => {
      snackbar.error(error, "Failed to archive ruleset");
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: async (id: string) => {
      return parseResponse(
        rpc.api.rulesets[":id"].unarchive.$post({
          param: { id },
        }),
      );
    },
    onSuccess: (_, id) => {
      snackbar.success("Ruleset unarchived");
      void refreshRuleset(id);
    },
    onError: (error) => {
      snackbar.error(error, "Failed to unarchive ruleset");
    },
  });

  const toggleStar = useToggleRulesetStar();

  const publishMutation = useMutation({
    mutationFn: async ({ id, kind }: { id: string; kind?: PublishKind }) => {
      return parseResponse(
        rpc.api.rulesets[":id"].publish.$post({
          param: { id },
          json: { kind },
        }),
      );
    },
    onSuccess: (_, { id }) => {
      snackbar.success("Ruleset published");
      void refreshRuleset(id);
      setPublishDialogOpen(false);
    },
    onError: (error) => {
      snackbar.error(error, "Failed to publish ruleset");
    },
  });

  const subscribeMutation = useMutation({
    mutationFn: async ({ id, extensionIds }: { extensionIds: string[]; id: string }) => {
      return parseResponse(
        rpc.api.rulesets[":id"].subscribe.$post({
          param: { id },
          json: { extensionIds },
        }),
      );
    },
    onSuccess: (_, { id, extensionIds }) => {
      snackbar.success(
        `Subscribed to ${extensionIds.length === 1 ? "extension" : formatCount(extensionIds.length, "extension")}`,
      );
      setSubscribeDialogOpen(false);
      void refreshRuleset(id, true);
    },
    onError: (error) => {
      snackbar.error(error, "Failed to subscribe to extension");
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: async ({ id, extensionId }: { extensionId: string; id: string }) => {
      return parseResponse(
        rpc.api.rulesets[":id"].unsubscribe.$post({
          param: { id },
          json: { extensionId },
        }),
      );
    },
    onSuccess: (_, { id }) => {
      snackbar.success("Unsubscribed from extension");
      setUnsubscribeDialogOpen(false);
      setUnsubscribeTarget(null);
      void refreshRuleset(id, true);
    },
    onError: (error) => {
      snackbar.error(error, "Failed to unsubscribe from extension");
    },
  });

  const handleEdit = (ruleset: Ruleset) => {
    setSelectedRuleset(ruleset);
    editForm.reset({
      name: ruleset.name,
      description: ruleset.description,
      private: ruleset.private,
      kind: ruleset.kind,
    });
    setEditDialogOpen(true);
  };

  const handleFork = (ruleset: Ruleset) => {
    setSelectedRuleset(ruleset);
    forkForm.reset({
      name: `${ruleset.name} (Fork)`,
      description: ruleset.description,
      private: false,
    });
    setForkDialogOpen(true);
  };

  const handleArchive = (ruleset: Ruleset) => {
    setSelectedRuleset(ruleset);
    setArchiveDialogOpen(true);
  };

  const handlePublish = (ruleset: Ruleset) => {
    setSelectedRuleset(ruleset);
    setPublishKind(ruleset.kind ?? "ruleset");
    setPublishDialogOpen(true);
  };

  const handleSubscribe = (ruleset: Ruleset) => {
    setSelectedRuleset(ruleset);
    setSubscribeDialogOpen(true);
  };

  const confirmSubscribe = (extensionIds: string[]) => {
    if (selectedRuleset) {
      subscribeMutation.mutate({
        id: selectedRuleset.id,
        extensionIds,
      });
    }
  };

  const handleUnsubscribe = (rulesetId: string, extensionId: string, extensionName: string) => {
    setUnsubscribeTarget({ rulesetId, extensionId, extensionName });
    setUnsubscribeDialogOpen(true);
  };

  const confirmUnsubscribe = () => {
    if (unsubscribeTarget) {
      unsubscribeMutation.mutate({
        id: unsubscribeTarget.rulesetId,
        extensionId: unsubscribeTarget.extensionId,
      });
    }
  };

  const confirmEdit = (data: EditRulesetFormData) => {
    if (selectedRuleset) updateMutation.mutate({ id: selectedRuleset.id, data });
  };

  const confirmFork = (data: ForkRulesetFormData) => {
    if (selectedRuleset) forkMutation.mutate({ id: selectedRuleset.id, data });
  };

  const confirmArchive = () => {
    if (selectedRuleset) archiveMutation.mutate(selectedRuleset.id);
  };

  const confirmPublish = (kind?: PublishKind) => {
    if (selectedRuleset) publishMutation.mutate({ id: selectedRuleset.id, kind });
  };

  return {
    editDialogOpen,
    setEditDialogOpen,
    forkDialogOpen,
    setForkDialogOpen,
    archiveDialogOpen,
    setArchiveDialogOpen,
    publishDialogOpen,
    setPublishDialogOpen,
    publishKind,
    setPublishKind,
    subscribeDialogOpen,
    setSubscribeDialogOpen,
    unsubscribeDialogOpen,
    setUnsubscribeDialogOpen,
    unsubscribeTarget,

    selectedRuleset,
    setSelectedRuleset,

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
    confirmEdit,
    confirmFork,
    confirmArchive,
    confirmPublish,
    confirmSubscribe,
    confirmUnsubscribe,
    toggleStar,
  };
}
