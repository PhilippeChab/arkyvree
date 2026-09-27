import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import type { RulesetListItem } from "@/client/src/lib/queries.ts";
import type {
  EditRulesetFormData,
  ForkRulesetFormData,
} from "@/client/src/pages/rulesets/details/components/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType } from "hono/client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { useToggleRulesetStar } from "./useToggleRulesetStar.ts";

type Ruleset = RulesetListItem;
/** Published as a base ruleset or as an extension. */
export type PublishKind = NonNullable<InferRequestType<(typeof rpc.api.rulesets)[":id"]["publish"]["$post"]>["json"]["kind"]>;

export function useRulesetOperations() {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const navigate = useNavigate();

  // Dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [forkDialogOpen, setForkDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [subscribeDialogOpen, setSubscribeDialogOpen] = useState(false);
  const [unsubscribeDialogOpen, setUnsubscribeDialogOpen] = useState(false);
  const [unsubscribeTarget, setUnsubscribeTarget] = useState<{ rulesetId: string; extensionId: string; extensionName: string } | null>(null);

  // Selected item state
  const [selectedRuleset, setSelectedRuleset] = useState<Ruleset | null>(null);

  /** Refetches a ruleset and the lists that show it. */
  const refreshRuleset = (id: string) => Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.detail(id) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.lists }),
  ]);

  // Forms
  const editForm = useForm<EditRulesetFormData>();
  const forkForm = useForm<ForkRulesetFormData>();

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data, updatedAt }: { id: string; data: EditRulesetFormData; updatedAt?: string }) => {
      return parseResponse(rpc.api.rulesets[":id"].$put({
        param: { id },
        json: { ...data, updatedAt },
      }));
    },
    onSuccess: (_, { id }) => {
      snackbar.success("Ruleset updated successfully");
      void refreshRuleset(id);
      setEditDialogOpen(false);
      editForm.reset();
    },
    onError: (error) => {
      snackbar.error(error, "Failed to update ruleset");
    },
  });

  // Fork mutation
  const forkMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ForkRulesetFormData }) => {
      return parseResponse(rpc.api.rulesets[":id"].fork.$post({
        param: { id },
        json: data,
      }));
    },
    onSuccess: (data) => {
      snackbar.success("Ruleset forked successfully");
      queryClient.invalidateQueries({
        queryKey: queryKeys.rulesets.lists,
      });
      setForkDialogOpen(false);
      forkForm.reset();
      navigate(`/rulesets/${data.id}`);
    },
    onError: (error) => {
      snackbar.error(error, "Failed to fork ruleset");
    },
  });

  // Archive mutation
  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      return parseResponse(rpc.api.rulesets[":id"].archive.$post({
        param: { id },
      }));
    },
    onSuccess: (_, id) => {
      snackbar.success("Ruleset archived successfully");
      void refreshRuleset(id);
      setArchiveDialogOpen(false);
    },
    onError: (error) => {
      snackbar.error(error, "Failed to archive ruleset");
    },
  });

  // Unarchive mutation
  const unarchiveMutation = useMutation({
    mutationFn: async (id: string) => {
      return parseResponse(rpc.api.rulesets[":id"].unarchive.$post({
        param: { id },
      }));
    },
    onSuccess: (_, id) => {
      snackbar.success("Ruleset unarchived successfully");
      void refreshRuleset(id);
    },
    onError: (error) => {
      snackbar.error(error, "Failed to unarchive ruleset");
    },
  });

  const toggleStar = useToggleRulesetStar();

  // Publish mutation
  const publishMutation = useMutation({
    mutationFn: async ({ id, kind }: { id: string; kind?: PublishKind }) => {
      return parseResponse(rpc.api.rulesets[":id"].publish.$post({
        param: { id },
        json: { kind },
      }));
    },
    onSuccess: (_, { id }) => {
      snackbar.success("Ruleset published successfully");
      void refreshRuleset(id);
      setPublishDialogOpen(false);
    },
    onError: (error) => {
      snackbar.error(error, "Failed to publish ruleset");
    },
  });

  // Subscribe extension mutation
  const subscribeMutation = useMutation({
    mutationFn: async ({ id, extensionIds }: { id: string; extensionIds: string[] }) => {
      return parseResponse(rpc.api.rulesets[":id"].subscribe.$post({
        param: { id },
        json: { extensionIds },
      }));
    },
    onSuccess: (_, { id, extensionIds }) => {
      snackbar.success(`Subscribed to ${extensionIds.length === 1 ? "extension" : formatCount(extensionIds.length, "extension")} successfully`);
      setSubscribeDialogOpen(false);
      void refreshRuleset(id);
    },
    onError: (error) => {
      snackbar.error(error, "Failed to subscribe to extension");
    },
  });

  // Unsubscribe extension mutation
  const unsubscribeMutation = useMutation({
    mutationFn: async ({ id, extensionId }: { id: string; extensionId: string }) => {
      return parseResponse(rpc.api.rulesets[":id"].unsubscribe.$post({
        param: { id },
        json: { extensionId },
      }));
    },
    onSuccess: (_, { id }) => {
      snackbar.success("Unsubscribed from extension successfully");
      setUnsubscribeDialogOpen(false);
      setUnsubscribeTarget(null);
      void refreshRuleset(id);
    },
    onError: (error) => {
      snackbar.error(error, "Failed to unsubscribe from extension");
    },
  });

  // Handlers
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
    if (selectedRuleset) {
      updateMutation.mutate({ id: selectedRuleset.id, data });
    }
  };

  const confirmFork = (data: ForkRulesetFormData) => {
    if (selectedRuleset) {
      forkMutation.mutate({ id: selectedRuleset.id, data });
    }
  };

  const confirmArchive = () => {
    if (selectedRuleset) {
      archiveMutation.mutate(selectedRuleset.id);
    }
  };

  const confirmPublish = (kind?: PublishKind) => {
    if (selectedRuleset) {
      publishMutation.mutate({ id: selectedRuleset.id, kind });
    }
  };

  return {
    // Dialog states
    editDialogOpen,
    setEditDialogOpen,
    forkDialogOpen,
    setForkDialogOpen,
    archiveDialogOpen,
    setArchiveDialogOpen,
    publishDialogOpen,
    setPublishDialogOpen,
    subscribeDialogOpen,
    setSubscribeDialogOpen,
    unsubscribeDialogOpen,
    setUnsubscribeDialogOpen,
    unsubscribeTarget,

    // Selected item
    selectedRuleset,
    setSelectedRuleset,

    // Forms
    editForm,
    forkForm,

    // Mutations
    updateMutation,
    forkMutation,
    archiveMutation,
    unarchiveMutation,
    publishMutation,
    subscribeMutation,
    unsubscribeMutation,

    // Handlers
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
