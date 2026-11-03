import { IconButton, Stack, type SxProps, type Theme, Typography } from "@mui/material";

import { AddIcon, RemoveIcon } from "@/client/src/components/icons/index.ts";
import { formatSigned } from "@/shared/text.ts";

import { ScoreBox } from "./ScoreBox.tsx";
import type { SheetScore } from "./sheetBlocks.ts";

interface ScoreTileProps {
  compact?: boolean;
  /** Its base set to `base`, by its owner's edit, within its bounds (none in the compact form, or read only). */
  onBaseChange?: (score: SheetScore, base: number) => void;
  score: SheetScore;
  /** Its place in a row of boxes (`ScoreBox`'s). */
  sx?: SxProps<Theme>;
}

/**
 * A score's box: its value, its badge under it (a modifier, toned by its sign), then its base, which its owner raises
 * and lowers within its bounds, and its other parts; compact, its short label over its value and badge. A box with a
 * badge stands taller, its row's height.
 */
export function ScoreTile({ score, onBaseChange, compact, sx }: ScoreTileProps) {
  const { badge, base, label, parts, short, signed, value } = score;
  const edit = !compact && base ? onBaseChange : undefined;

  return (
    <ScoreBox
      sx={sx}
      label={compact ? short : label}
      value={signed ? formatSigned(value) : value}
      compact={compact}
      minHeight={badge === undefined ? 160 : 180}
      badge={
        badge !== undefined && (
          <Typography
            variant={compact ? "caption" : "body1"}
            sx={{
              alignSelf: "center",
              fontWeight: 600,
              color: badge >= 0 ? "success.main" : "error.main",
              border: 1,
              borderColor: "divider",
              borderRadius: 1,
              py: compact ? 0.25 : 0.5,
              px: 1,
              minWidth: compact ? 32 : 40,
            }}
          >
            {formatSigned(badge)}
          </Typography>
        )
      }
      editor={
        edit &&
        base && (
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", justifyContent: "center" }}>
            <IconButton
              size="small"
              aria-label={`Lower ${base.label} ${label}`}
              onClick={() => edit(score, base.value - 1)}
              disabled={base.value <= base.min}
              sx={{ p: 0 }}
            >
              <RemoveIcon sx={{ fontSize: 14 }} />
            </IconButton>
            <Typography variant="caption" sx={{ color: "text.secondary", minWidth: 40 }}>
              {`${base.label}: `}
              {base.value}
            </Typography>
            <IconButton
              size="small"
              aria-label={`Raise ${base.label} ${label}`}
              onClick={() => edit(score, base.value + 1)}
              disabled={base.value >= base.max}
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
          : [
              ...(edit || !base ? [] : [`${base.label}: ${base.value}`]),
              ...parts.map(({ label, value }) => `${label}: ${value}`),
            ]
      }
    />
  );
}
