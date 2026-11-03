import { Box, Button, Stack, Typography } from "@mui/material";

import { DiceSpinner, Panel } from "@/client/src/components/common/index.ts";

interface ProgressionSaveBarProps {
  /** Its changes save something: false leaves its Save off, its Discard on */
  canSave?: boolean;
  /** What the tab changed, in words, one a line ("Base Attack Bonus: Medium → Good, 20 levels"), each by what it changed */
  changes: { key: string; label: string }[];
  onDiscard: () => void;
  onSave: () => void;
  pending: boolean;
  /** What its Save writes, which its button names ("Progression": "Save Progression") */
  what: string;
}

/**
 * An owner's Progression or Spells tab's save, once it holds a change: what it changed, its Discard and its Save, which
 * writes it all at once. It stays at the bottom of the window as the tab scrolls.
 */
export function ProgressionSaveBar({
  canSave = true,
  changes,
  onDiscard,
  onSave,
  pending,
  what,
}: ProgressionSaveBarProps) {
  if (changes.length === 0) return null;
  return (
    <Panel
      sx={{
        position: "sticky",
        bottom: (theme) => `calc(${theme.spacing(2)} + env(safe-area-inset-bottom, 0px))`,
        zIndex: (theme) => theme.zIndex.appBar,
        boxShadow: 6,
      }}
    >
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" } }}>
        <Box component="ul" sx={{ m: 0, pl: 2.5, flex: 1 }}>
          {changes.map((change) => (
            <Typography component="li" variant="body2" key={change.key}>
              {change.label}
            </Typography>
          ))}
        </Box>
        <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
          <Button onClick={onDiscard} disabled={pending}>
            Discard
          </Button>
          <Button variant="contained" onClick={onSave} disabled={pending || !canSave}>
            <DiceSpinner size="small" loading={pending}>
              Save {what}
            </DiceSpinner>
          </Button>
        </Stack>
      </Stack>
    </Panel>
  );
}
