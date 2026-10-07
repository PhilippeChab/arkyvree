import { Box, Stack } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useState } from "react";

import { SheetSection } from "@/client/src/components/characters/sections/SheetSection.tsx";
import { BlankState, ConfirmDialog } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { sortAbilities } from "@/client/src/lib/abilityOrder.ts";
import { characterDetailQuery } from "@/client/src/lib/queries.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useUserPreferencesStore } from "@/client/src/stores/userPreferencesStore.ts";
import { computeAbilityModifier } from "@/shared/dnd3.5/abilities.ts";

import { AbilityScoreBox } from "./AbilityScoreBox.tsx";
import type { Dnd35AbilityScoresSectionProps } from "./types.ts";

export function AbilityScoresSection({ abilities, characterId, readOnly }: Dnd35AbilityScoresSectionProps) {
  const entries = Object.entries(abilities);
  const sortedEntries = sortAbilities(entries, "Dungeons & Dragons: 3.5", ([name]) => name);
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  const queryKey = characterDetailQuery(characterId).queryKey;

  const updateMutation = useMutation({
    mutationFn: async ({ abilityId, score }: { abilityId: string; score: number }) => {
      return parseResponse(
        rpc.api.characters[":id"].abilities.$put({
          param: { id: characterId },
          json: { [abilityId]: score },
        }),
      );
    },
    onMutate: async ({ abilityId, score }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);

      queryClient.setQueryData(queryKey, (old) => {
        if (!old) return old;
        const updated = { ...old.abilities };
        for (const [name, data] of Object.entries(updated)) {
          if (data.abilityId === abilityId) {
            const base = score;
            const level = data.level || 0;
            const misc = data.misc || 0;
            const total = base + level + misc;
            const modifier = computeAbilityModifier(total);
            updated[name] = { ...data, base, total, modifier };
            break;
          }
        }
        return { ...old, abilities: updated };
      });

      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);

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
    const current = Object.values(abilities).find((a) => a.abilityId === abilityId);
    const currentBase = current?.base || 10;

    if (score > currentBase || !shouldWarn("abilityDecrease")) updateMutation.mutate({ abilityId, score });
    else setPendingChange({ abilityId, score });
  };

  return (
    <SheetSection title="Ability Scores">
      {sortedEntries.length > 0 ? (
        <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "center" }}>
          {sortedEntries.map(([ability, abilityData]) => {
            const total = abilityData.total || abilityData.base || 10;
            const modifier = computeAbilityModifier(total);
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
        </Stack>
      ) : (
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
    </SheetSection>
  );
}
