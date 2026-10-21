import { IconButton, Stack, type SxProps, type Theme, Typography } from "@mui/material";

import { AddIcon, RemoveIcon } from "@/client/src/components/icons/index.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import { formatSigned } from "@/shared/text.ts";

import { ScoreBox } from "./ScoreBox.tsx";

interface AbilityScoreBoxProps {
  /**
   * The ability as the engine gives it: its name as its ruleset gives it ("Force Points"), which labels the full form,
   * its abbreviation (FOR), which labels the compact one, and its scores.
   */
  ability: CharacterDetail["abilities"][number];
  /** The bounds of its base, its rules', which its edit keeps it within (none in the compact form, or read only) */
  bounds?: { max: number; min: number };
  compact?: boolean;
  /** Its base set to `base`, by its owner's edit (none in the compact form, or read only). */
  onBaseChange?: (ability: CharacterDetail["abilities"][number], base: number) => void;
  readOnly?: boolean;
  /** Its place in a row of boxes (`ScoreBox`'s). */
  sx?: SxProps<Theme>;
}

/**
 * An ability's box: its total and modifier, then its base, which its owner raises and lowers within its rules' bounds,
 * and its other parts as its rules list them (3.5's levels' increases and misc); compact, its abbreviation over its
 * total and modifier.
 */
export function AbilityScoreBox({ ability, bounds, onBaseChange, readOnly, compact, sx }: AbilityScoreBoxProps) {
  const { abbreviation, base, modifier, name, parts, total } = ability;
  const edit = !readOnly && !compact && bounds ? onBaseChange : undefined;

  return (
    <ScoreBox
      sx={sx}
      label={compact ? abbreviation : name}
      value={total}
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
              aria-label={`Lower Base ${name}`}
              onClick={() => edit(ability, base - 1)}
              disabled={base <= (bounds?.min ?? base)}
              sx={{ p: 0 }}
            >
              <RemoveIcon sx={{ fontSize: 14 }} />
            </IconButton>
            <Typography variant="caption" sx={{ color: "text.secondary", minWidth: 40 }}>
              Base: {base}
            </Typography>
            <IconButton
              size="small"
              aria-label={`Raise Base ${name}`}
              onClick={() => edit(ability, base + 1)}
              disabled={base >= (bounds?.max ?? base)}
              sx={{ p: 0 }}
            >
              <AddIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Stack>
        )
      }
      breakdown={
        compact
          ? undefined
          : [...(edit ? [] : [`Base: ${base}`]), ...parts.map(({ label, value }) => `${label}: ${value}`)]
      }
    />
  );
}
