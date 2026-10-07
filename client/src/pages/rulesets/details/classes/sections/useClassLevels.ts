import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import { useState } from "react";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormWith } from "@/client/src/hooks/index.ts";
import type { CreateLevelFormData } from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { classLevelsQuery } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import { invalidateRulesetEdit } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";

type LevelsArray = InferResponseType<(typeof rpc.api.rulesets)[":id"]["classes"][":classId"]["levels"]["$get"], 200>;
export type Level = LevelsArray[number];

export function useClassLevels(rulesetId: string, classId: string) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const createForm = useFormWith<CreateLevelFormData>({
    level: 1,
    bab: 0,
    skills: 1,
    saves: [],
    feats: [],
  });

  const { data: levels, isLoading, error } = useQuery(classLevelsQuery(rulesetId, classId));

  const createMutation = useMutation({
    mutationFn: async (data: CreateLevelFormData) =>
      parseResponse(
        rpc.api.rulesets[":id"].classes[":classId"].levels.$post({
          param: { id: rulesetId, classId },
          json: data,
        }),
      ),
    onSuccess: () => {
      snackbar.success("Level created");
      invalidateRulesetEdit(queryClient, rulesetId, [classLevelsQuery(rulesetId, classId).queryKey]);
      setCreateDialogOpen(false);
    },
    onError: (error) => {
      snackbar.error(error, "Failed to create level");
    },
  });

  // Compute highest level for defaults
  const highestLevel = levels?.slice().sort((a, b) => b.level - a.level)[0] ?? null;

  const handleCreate = () => {
    createForm.reset({
      level: highestLevel ? highestLevel.level + 1 : 1,
      bab: highestLevel?.bab ?? 0,
      skills: highestLevel?.skills ?? 1,
      saves: highestLevel?.saves?.map((s) => ({ saveId: s.saveId, base: s.base })) ?? [],
      feats: [],
    });
    setCreateDialogOpen(true);
  };

  const confirmCreate = (data: CreateLevelFormData) => {
    createMutation.mutate(data);
  };

  return {
    levels,
    isLoading,
    error,

    createDialogOpen,
    setCreateDialogOpen,

    highestLevel,

    createForm,

    createMutation,

    handleCreate,
    confirmCreate,
  };
}
