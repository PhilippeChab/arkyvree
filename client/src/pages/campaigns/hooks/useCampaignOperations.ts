import type {
  CreateCampaignFormData,
} from "@/client/src/pages/campaigns/components/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";

export function useCampaignOperations() {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const navigate = useNavigate();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const createForm = useForm<CreateCampaignFormData>({
    defaultValues: {
      name: "",
      description: "",
      rulesetId: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateCampaignFormData) => {
      const response = await rpc.api.campaigns.$post({
        json: data,
      });
      return response.json();
    },
    onSuccess: (data) => {
      snackbar.success("Campaign created successfully");
      queryClient.invalidateQueries({
        queryKey: queryKeys.campaigns.lists,
      });
      setCreateDialogOpen(false);
      createForm.reset();
      navigate(`/campaigns/${(data as { campaign: { id: string } }).campaign.id}`);
    },
    onError: (error) => {
      snackbar.error(error);
    },
  });

  const handleCreate = () => {
    setCreateDialogOpen(true);
  };

  const confirmCreate = (data: CreateCampaignFormData) => {
    createMutation.mutate(data);
  };

  return {
    createDialogOpen,
    setCreateDialogOpen,
    createForm,
    createMutation,
    handleCreate,
    confirmCreate,
  };
}
