import { Box, Collapse, List, ListItemText } from "@mui/material";
import { useState } from "react";

import { SubsectionTitle, ToggleLabel } from "@/client/src/components/common/index.ts";

interface AutoGrantedPicksProps {
  /** Closed at first while there's something to pick below it. */
  defaultCollapsed: boolean;
  picks: GrantedPick[];
  /** What it grants, plural ("Feats", "Spells"). */
  what: string;
}

/** A pick the levels grant on their own; a spell that's a class ability (`free`) says so. */
interface GrantedPick {
  free?: boolean;
  id: string;
  name: string;
}

/** What a granted spell that's a class ability says after its name, in its step and in the review. */
export const CLASS_ABILITY_NOTE = " (class ability)";

/** What the levels grant on their own, in a pick step: a heading that opens and closes the list of it. */
export function AutoGrantedPicks({ what, picks, defaultCollapsed }: AutoGrantedPicksProps) {
  const [open, setOpen] = useState(!defaultCollapsed);
  return (
    <Box>
      <SubsectionTitle component="h4">
        <ToggleLabel open={open} onToggle={() => setOpen(!open)}>
          Auto-Granted {what} ({picks.length})
        </ToggleLabel>
      </SubsectionTitle>
      <Collapse in={open}>
        <List dense>
          {picks.map((pick, i) => (
            // A stackable pick can be granted at several levels
            <ListItemText key={`${pick.id}-${i}`} primary={`${pick.name}${pick.free ? CLASS_ABILITY_NOTE : ""}`} />
          ))}
        </List>
      </Collapse>
    </Box>
  );
}
