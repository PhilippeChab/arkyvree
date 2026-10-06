import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormWith } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import type { CreateCampaignFormData } from "@/client/src/pages/campaigns/components/index.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

export function useCampaignOperations() {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const navigate = useNavigate();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const createForm = useFormWith<CreateCampaignFormData>({
    name: "",
    description: "",
    rulesetId: "",
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateCampaignFormData) => parseResponse(rpc.api.campaigns.$post({ json: data })),
    onSuccess: (data) => {
      snackbar.success("Campaign created successfully");
      queryClient.invalidateQueries({
        queryKey: queryKeys.campaigns.lists,
      });
      setCreateDialogOpen(false);
      createForm.reset();
      navigate(`/campaigns/${data.campaign.id}`);
    },
    onError: (error) => {
      snackbar.error(error, "Failed to create campaign");
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
