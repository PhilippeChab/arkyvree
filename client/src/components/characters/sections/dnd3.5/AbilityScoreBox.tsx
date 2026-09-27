import { formatSigned } from "@/client/src/lib/formatNumeric.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import { Add as AddIcon, Remove as RemoveIcon } from "@mui/icons-material";
import { Box, IconButton, Paper, Stack, Typography } from "@mui/material";

interface AbilityScoreBoxProps {
  ability: string;
  score: number;
  modifier: number;
  abilityData?: CharacterDetail["abilities"][string];
  onBaseChange?: (abilityId: string, value: number) => void;
  readOnly?: boolean;
  compact?: boolean;
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
  const baseValue = abilityData?.base || 10;
  const edit = !readOnly && !compact && abilityData?.abilityId && onBaseChange
    ? { abilityId: abilityData.abilityId, onBaseChange }
    : null;
  const label = compact ? ability.slice(0, 3).toUpperCase() : ability;
  const breakdown = compact ? undefined : abilityData;

  return (
    <Paper
      variant="outlined"
      sx={{
        p: compact ? 1 : 2,
        textAlign: "center",
        ...(compact ? { display: "flex", flexDirection: "column", gap: 0.5 } : { minHeight: 180, display: "flex", flexDirection: "column", justifyContent: "space-between" }),
      }}
    >
      <Typography
        variant={compact ? "caption" : "h6"}
        sx={{
          fontWeight: 600,
          textTransform: "uppercase",
          ...(compact ? { lineHeight: 1 } : { fontSize: "0.9rem" }),
        }}
      >
        {label}
      </Typography>
      <Box>
        <Typography
          sx={{
            fontWeight: 700,
            lineHeight: 1,
            typography: compact ? { xs: "h6", sm: "h5" } : { xs: "h5", sm: "h4" },
          }}
        >
          {score}
        </Typography>

        <Typography
          variant={compact ? "caption" : "body1"}
          sx={{
            fontWeight: 600,
            color: modifier >= 0 ? "success.main" : "error.main",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            py: compact ? 0.25 : 0.5,
            px: 1,
            mt: compact ? 0.5 : 1,
            mb: compact ? 0 : 2,
            display: "inline-block",
            minWidth: compact ? 32 : 40,
          }}
        >
          {formatSigned(modifier)}
        </Typography>

        {breakdown && (
          <Box sx={{ fontSize: "0.75rem", textAlign: "center" }}>
            {edit ? (
              <Stack
                direction="row"
                spacing={0.5}
                sx={{ alignItems: "center", justifyContent: "center" }}
              >
                <IconButton
                  size="small"
                  aria-label={`Lower base ${ability}`}
                  onClick={() => edit.onBaseChange(edit.abilityId, baseValue - 1)}
                  disabled={baseValue <= 1}
                  sx={{ p: 0 }}
                >
                  <RemoveIcon sx={{ fontSize: 14 }} />
                </IconButton>
                <Typography variant="caption" sx={{ color: "text.secondary", minWidth: 40 }}>
                  Base: {baseValue}
                </Typography>
                <IconButton
                  size="small"
                  aria-label={`Raise base ${ability}`}
                  onClick={() => edit.onBaseChange(edit.abilityId, baseValue + 1)}
                  disabled={baseValue >= 100}
                  sx={{ p: 0 }}
                >
                  <AddIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Stack>
            ) : (
              <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                Base: {baseValue}
              </Typography>
            )}
            <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
              Level: {formatSigned(breakdown.level)}
            </Typography>
            <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
              Misc: {formatSigned(breakdown.misc)}
            </Typography>
          </Box>
        )}
      </Box>
    </Paper>
  );
}
