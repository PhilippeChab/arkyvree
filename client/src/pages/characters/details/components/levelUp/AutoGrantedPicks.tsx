import { Box, Collapse, List, ListItemText } from "@mui/material";
import { useState } from "react";

import { SubsectionTitle, ToggleLabel } from "@/client/src/components/common/index.ts";
import { DURATION } from "@/client/src/theme/animations.ts";

import { freeGrantNote } from "./freeGrantNote.ts";

interface AutoGrantedPicksProps {
  /** Closed at first while there's something to pick below it. */
  defaultCollapsed: boolean;
  /** What a pick that takes no slot says after its name, its rules' ("class ability") */
  note: string | undefined;
  picks: GrantedPick[];
  /** What it grants, plural ("Feats", "Spells"). */
  what: string;
}

/** A pick the levels grant on their own; one that takes no slot of its pool (`free`) says so. */
interface GrantedPick {
  free?: boolean;
  id: string;
  name: string;
}

/** What the levels grant on their own, in a pick step: a heading that opens and closes the list of it. */
export function AutoGrantedPicks({ what, note, picks, defaultCollapsed }: AutoGrantedPicksProps) {
  const [open, setOpen] = useState(!defaultCollapsed);
  return (
    <Box>
      <SubsectionTitle component="h4">
        <ToggleLabel open={open} onToggle={() => setOpen(!open)}>
          Auto-Granted {what} ({picks.length})
        </ToggleLabel>
      </SubsectionTitle>
      <Collapse in={open} timeout={DURATION.moderate}>
        <List dense>
          {picks.map((pick, i) => (
            // A stackable pick can be granted at several levels
            <ListItemText key={`${pick.id}-${i}`} primary={`${pick.name}${pick.free ? freeGrantNote(note) : ""}`} />
          ))}
        </List>
      </Collapse>
    </Box>
  );
}
