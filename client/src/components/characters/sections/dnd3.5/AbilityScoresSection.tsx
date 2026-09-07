import { BlankState, ConfirmDialog } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { sortAbilities } from "@/client/src/lib/abilityOrder.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useUserPreferencesStore } from "@/client/src/stores/userPreferencesStore.ts";
import { Box, Paper, Typography } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { AbilityScoresSectionProps } from "../../sectionFactory.ts";
import { AbilityScoreBox } from "./AbilityScoreBox.tsx";

export function AbilityScoresSection({
  abilities,
  characterId,
  readOnly,
}: AbilityScoresSectionProps) {
  const entries = Object.entries(abilities);
  const sortedEntries = sortAbilities(entries, "Dungeons & Dragons: 3.5", ([name]) => name);
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  const queryKey = queryKeys.characters.detail(characterId);

  const updateMutation = useMutation({
    mutationFn: async ({ abilityId, score }: { abilityId: string; score: number }) => {
      const response = await rpc.api.characters[":id"].abilities.$put({
        param: { id: characterId },
        json: { [abilityId]: score },
      });
      if (!response.ok) throw new Error("Failed to update ability score");
      return response.json();
    },
    onMutate: async ({ abilityId, score }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);

      queryClient.setQueryData(queryKey, (old: Record<string, unknown> | undefined) => {
        if (!old || !old.abilities) return old;
        const abilities = old.abilities as Record<string, { abilityId?: string; base?: number; level?: number; misc?: number; total?: number; modifier?: number }>;
        const updated = { ...abilities };
        for (const [name, data] of Object.entries(updated)) {
          if (data.abilityId === abilityId) {
            const base = score;
            const level = data.level || 0;
            const misc = data.misc || 0;
            const total = base + level + misc;
            const modifier = Math.floor((total - 10) / 2);
            updated[name] = { ...data, base, total, modifier };
            break;
          }
        }
        return { ...old, abilities: updated };
      });

      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      snackbar.error(error, "Failed to update ability score");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const [pendingChange, setPendingChange] = useState<{ abilityId: string; score: number } | null>(null);
  const shouldWarn = useUserPreferencesStore((s) => s.shouldWarn);
  const suppressWarningForSession = useUserPreferencesStore((s) => s.suppressWarningForSession);

  const handleBaseChange = (abilityId: string, score: number) => {
    const current = Object.values(abilities).find(
      (a) => (a as { abilityId?: string }).abilityId === abilityId,
    ) as { base?: number } | undefined;
    const currentBase = current?.base || 10;

    if (score > currentBase || !shouldWarn("abilityDecrease")) {
      updateMutation.mutate({ abilityId, score });
    } else {
      setPendingChange({ abilityId, score });
    }
  };

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography sx={{ fontWeight: 600, color: "primary.main", mb: 3, typography: { xs: "h6", sm: "h5" } }}>
        Ability Scores
      </Typography>
      {sortedEntries.length > 0
        ? (
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "center" }}>
            {sortedEntries.map(([ability, data]) => {
              const abilityData = data as {
                abilityId?: string;
                base?: number;
                level?: number;
                misc?: number;
                total?: number;
              };
              const total = abilityData.total || abilityData.base || 10;
              const modifier = Math.floor((total - 10) / 2);
              return (
                <Box key={ability} sx={{ minWidth: { xs: 120, sm: 140 } }}>
                  <AbilityScoreBox
                    ability={ability}
                    score={total}
                    modifier={modifier}
                    abilityData={abilityData}
                    onBaseChange={handleBaseChange}
                    readOnly={readOnly}
                  />
                </Box>
              );
            })}
          </Box>
        )
        : (
          <BlankState title="No ability scores available" />
        )}
      <ConfirmDialog
        open={pendingChange !== null}
        onClose={() => setPendingChange(null)}
        title="Decrease Ability Score"
        message="Changing ability scores may break character prerequisites."
        confirmLabel="Decrease"
        onConfirm={() => {
          if (pendingChange) {
            updateMutation.mutate(pendingChange);
            setPendingChange(null);
            suppressWarningForSession("abilityDecrease");
          }
        }}
        isLoading={false}
      />
    </Paper>
  );
}
