import { IconButton, Stack, Typography } from "@mui/material";

import { AddIcon, RemoveIcon } from "@/client/src/components/icons/index.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import { formatSigned } from "@/shared/text.ts";
import { MAX_ABILITY_SCORE, MIN_ABILITY_SCORE, STARTING_ABILITY_SCORE } from "@/vocabulary/dnd3.5/abilities.ts";

import { ScoreBox } from "./ScoreBox.tsx";

interface AbilityScoreBoxProps {
  ability: string;
  abilityData?: CharacterDetail["abilities"][string];
  compact?: boolean;
  modifier: number;
  onBaseChange?: (abilityId: string, value: number) => void;
  readOnly?: boolean;
  score: number;
}

export function AbilityScoreBox({
  ability,
  score,
  modifier,
  abilityData,
  onBaseChange,
  readOnly,
  compact,
}: AbilityScoreBoxProps) {
  const baseValue = abilityData?.base ?? STARTING_ABILITY_SCORE;
  const edit =
    !readOnly && !compact && abilityData?.abilityId && onBaseChange
      ? { abilityId: abilityData.abilityId, onBaseChange }
      : null;
  const label = compact ? ability.slice(0, 3).toUpperCase() : ability;
  const breakdown = compact ? undefined : abilityData;

  return (
    <ScoreBox
      label={label}
      value={score}
      compact={compact}
      minHeight={180}
      badge={
        <Typography
          variant={compact ? "caption" : "body1"}
          sx={{
            alignSelf: "center",
            fontWeight: 600,
            color: modifier >= 0 ? "success.main" : "error.main",
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
            py: compact ? 0.25 : 0.5,
            px: 1,
            minWidth: compact ? 32 : 40,
          }}
        >
          {formatSigned(modifier)}
        </Typography>
      }
      editor={
        edit && (
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", justifyContent: "center" }}>
            <IconButton
              size="small"
              aria-label={`Lower Base ${ability}`}
              onClick={() => edit.onBaseChange(edit.abilityId, baseValue - 1)}
              disabled={baseValue <= MIN_ABILITY_SCORE}
              sx={{ p: 0 }}
            >
              <RemoveIcon sx={{ fontSize: 14 }} />
            </IconButton>
            <Typography variant="caption" sx={{ color: "text.secondary", minWidth: 40 }}>
              Base: {baseValue}
            </Typography>
            <IconButton
              size="small"
              aria-label={`Raise Base ${ability}`}
              onClick={() => edit.onBaseChange(edit.abilityId, baseValue + 1)}
              disabled={baseValue >= MAX_ABILITY_SCORE}
              sx={{ p: 0 }}
            >
              <AddIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Stack>
        )
      }
      breakdown={
        breakdown && [
          ...(edit ? [] : [`Base: ${baseValue}`]),
          `Level: ${formatSigned(breakdown.level)}`,
          `Misc: ${formatSigned(breakdown.misc)}`,
        ]
      }
    />
  );
}
