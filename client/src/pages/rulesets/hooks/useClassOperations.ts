import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useDebouncedValue } from "@/client/src/hooks/index.ts";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { useState } from "react";
import { useForm } from "react-hook-form";

type LevelsResponse = InferResponseType<
  (typeof rpc.api.rulesets)[":id"]["classes"][":classId"]["levels"]["$get"]
>;
type LevelsArray = Exclude<LevelsResponse, { error: string }>;
export type Level = LevelsArray[number];

type CreateLevelFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["classes"][":classId"]["levels"]["$post"]
>["json"];

type ClassSkillsResponse = InferResponseType<
  (typeof rpc.api.rulesets)[":id"]["classes"][":classId"]["skills"]["$get"]
>;
type ClassSkillsArray = Exclude<ClassSkillsResponse, { error: string }>;

export function useClassLevels(rulesetId: string, classId: string) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Forms
  const createForm = useForm<CreateLevelFormData>({
    defaultValues: {
      level: 1,
      bab: 0,
      skills: 1,
      saves: [],
      feats: [],
    },
  });

  // Query
  const { data: levels, isLoading } = useQuery({
    queryKey: queryKeys.rulesets.classLevels(rulesetId, classId),
    queryFn: async () => {
      const response = await rpc.api.rulesets[":id"].classes[":classId"].levels.$get({
        param: { id: rulesetId, classId },
      });
      if (!response.ok) throw new Error("Failed to fetch levels");
      return response.json();
    },
    enabled: !!rulesetId && !!classId,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: CreateLevelFormData) => {
      const response = await rpc.api.rulesets[":id"].classes[":classId"].levels.$post({
        param: { id: rulesetId, classId },
        json: data,
      });
      if (!response.ok) throw new Error("Failed to create level");
      return response.json();
    },
    onSuccess: () => {
      snackbar.success("Level created successfully");
      queryClient.invalidateQueries({
        queryKey: queryKeys.rulesets.classLevels(rulesetId, classId),
      });
      setCreateDialogOpen(false);
      createForm.reset();
    },
    onError: (error) => {
      snackbar.error(error, "Failed to create level");
    },
  });

  // Compute highest level for defaults
  const highestLevel = levels
    ?.slice()
    .sort((a, b) => b.level - a.level)[0] ?? null;

  // Handlers
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
    // Data
    levels,
    isLoading,

    // Dialog states
    createDialogOpen,
    setCreateDialogOpen,

    // Computed
    highestLevel,

    // Forms
    createForm,

    // Mutations
    createMutation,

    // Handlers
    handleCreate,
    confirmCreate,
  };
}

export function useClassSkills(rulesetId: string, classId: string) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  // Dialog states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Selected item state
  const [skillToRemove, setSkillToRemove] = useState<string | null>(null);

  // Fetch class skills data
  const { data: classSkills, isLoading } = useQuery({
    queryKey: queryKeys.rulesets.classSkills(rulesetId, classId),
    queryFn: async () => {
      const response = await rpc.api.rulesets[":id"].classes[":classId"].skills.$get({
        param: { id: rulesetId, classId },
      });
      if (!response.ok) throw new Error("Failed to fetch class skills");
      return response.json();
    },
    enabled: !!rulesetId && !!classId,
  });

  // Available skills with server-side search and pagination
  const [skillSearch, setSkillSearch] = useState("");
  const debouncedSkillSearch = useDebouncedValue(skillSearch);

  const {
    data: availableSkillsData,
    isLoading: isAvailableSkillsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: [...queryKeys.rulesets.section(rulesetId, "skills"), "autocomplete", debouncedSkillSearch],
    queryFn: async ({ pageParam }) => {
      const response = await rpc.api.rulesets[":id"].skills.$get({
        param: { id: rulesetId },
        query: {
          limit: "20",
          page: pageParam.toString(),
          ...(debouncedSkillSearch && { search: debouncedSkillSearch }),
        },
      });
      if (!response.ok) throw new Error("Failed to fetch skills");
      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: !!rulesetId,
  });
  const availableSkills = availableSkillsData?.pages.flatMap((page) => page.items) ?? [];

  const handleSkillsScroll = (event: React.UIEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const bottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
    if (bottom && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  // Add skill mutation
  const addSkillMutation = useMutation({
    mutationFn: async (skillId: string) => {
      const response = await rpc.api.rulesets[":id"].classes[":classId"].skills.$post({
        param: { id: rulesetId, classId },
        json: { skillId },
      });
      if (!response.ok) throw new Error("Failed to add skill to class");
      return response.json();
    },
    onMutate: async (skillId: string) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({
        queryKey: queryKeys.rulesets.classSkills(rulesetId, classId),
      });

      // Snapshot the previous value
      const previousClassSkills = queryClient.getQueryData(
        queryKeys.rulesets.classSkills(rulesetId, classId),
      );

      // Find the skill being added
      const skill = availableSkills?.find((s) => s.id === skillId);

      if (skill) {
        // Optimistically update to the new value
        queryClient.setQueryData(
          queryKeys.rulesets.classSkills(rulesetId, classId),
          (old: ClassSkillsArray | undefined) => {
            if (!old) return [];
            return [
              ...old,
              {
                skillId: skillId,
                skillsInRule: skill,
              },
            ];
          },
        );
      }

      // Return a context object with the snapshotted value
      return { previousClassSkills };
    },
    onSuccess: () => {
      snackbar.success("Skill added to class successfully");
    },
    onError: (err, _skillId, context) => {
      snackbar.error(err, "Failed to add skill to class");
      // If the mutation fails, use the context returned from onMutate to roll back
      queryClient.setQueryData(
        queryKeys.rulesets.classSkills(rulesetId, classId),
        context?.previousClassSkills,
      );
    },
    onSettled: () => {
      // Always refetch after error or success to ensure we have the latest data
      queryClient.invalidateQueries({
        queryKey: queryKeys.rulesets.classSkills(rulesetId, classId),
      });
    },
  });

  // Remove skill mutation
  const removeSkillMutation = useMutation({
    mutationFn: async (skillId: string) => {
      const response = await rpc.api.rulesets[":id"].classes[":classId"].skills[":skillId"].$delete(
        {
          param: { id: rulesetId, classId, skillId },
        },
      );
      if (!response.ok) throw new Error("Failed to remove skill from class");
      return response.json();
    },
    onMutate: async (skillId: string) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({
        queryKey: queryKeys.rulesets.classSkills(rulesetId, classId),
      });

      // Snapshot the previous value
      const previousClassSkills = queryClient.getQueryData(
        queryKeys.rulesets.classSkills(rulesetId, classId),
      );

      // Optimistically remove the skill
      queryClient.setQueryData(
        queryKeys.rulesets.classSkills(rulesetId, classId),
        (old: ClassSkillsArray | undefined) => {
          if (!old) return [];
          return old.filter((cs) => cs.skillId !== skillId);
        },
      );

      // Return a context object with the snapshotted value
      return { previousClassSkills };
    },
    onSuccess: () => {
      snackbar.success("Skill removed from class successfully");
    },
    onError: (err, _skillId, context) => {
      snackbar.error(err, "Failed to remove skill from class");
      // If the mutation fails, use the context returned from onMutate to roll back
      queryClient.setQueryData(
        queryKeys.rulesets.classSkills(rulesetId, classId),
        context?.previousClassSkills,
      );
    },
    onSettled: () => {
      // Always refetch after error or success to ensure we have the latest data
      queryClient.invalidateQueries({
        queryKey: queryKeys.rulesets.classSkills(rulesetId, classId),
      });
      setDeleteDialogOpen(false);
      setSkillToRemove(null);
    },
  });

  // Handlers
  const handleAddSkill = (skillId: string) => {
    addSkillMutation.mutate(skillId);
  };

  const handleRemoveSkill = (skillId: string) => {
    setSkillToRemove(skillId);
    setDeleteDialogOpen(true);
  };

  const confirmRemoveSkill = () => {
    if (skillToRemove) {
      removeSkillMutation.mutate(skillToRemove);
    }
  };

  return {
    // Data
    classSkills,
    availableSkills,
    isLoading,
    isAvailableSkillsLoading,

    // Search & pagination
    setSkillSearch,
    handleSkillsScroll,

    // Dialog states
    deleteDialogOpen,
    setDeleteDialogOpen,

    // Mutations
    addSkillMutation,
    removeSkillMutation,

    // Handlers
    handleAddSkill,
    handleRemoveSkill,
    confirmRemoveSkill,
  };
}
