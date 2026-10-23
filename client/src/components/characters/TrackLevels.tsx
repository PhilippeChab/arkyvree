import { Link as MuiLink, Popover, Stack, Typography } from "@mui/material";
import { Link } from "react-router-dom";

import {
  LinkButton,
  ROW_ACTIONS_HOVER_SX,
  RowAction,
  RowActions,
  SubsectionTitle,
} from "@/client/src/components/common/index.ts";
import { AddIcon, EditIcon } from "@/client/src/components/icons/index.ts";
import { useAnchorMenu } from "@/client/src/hooks/index.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";

interface TrackLevelsProps {
  /** Opens Add Level with the track planned for the next advancement: an editor's */
  onAddLevel?: (trackId: string) => void;
  /** Edits an advancement; a read-only viewer sees them without it. */
  onEditLevel?: (editingLevel: EditingLevel) => void;
  /** Its track, as its summary describes it, with one advancement at least */
  track: SheetTrack;
  /** Its track's page, which its name over its advancements links to, in a new tab */
  trackLink?: string;
}

/** An advancement the sheet opens in Edit Level: its own row's id. */
export interface EditingLevel {
  characterLevelId: string;
}

/** A track of a sheet's summary: 3.5's class, with the character's levels in it. */
export type SheetTrack = CharacterDetail["summary"]["tracks"][number];

/**
 * A track on a sheet's header, at its position ("Fighter 3"): its click opens its advancements, under its name, which
 * an editor opens in Edit Level, and an editor's plus at the name's end adds an advancement on it. A viewer with nothing
 * to do there, no page to open and no advancement to add or edit (a shared sheet's), reads it as text.
 */
export function TrackLevels({ track, trackLink, onAddLevel, onEditLevel }: TrackLevelsProps) {
  const popover = useAnchorMenu();

  if (!trackLink && !onAddLevel && !onEditLevel) return track.label;

  return (
    <>
      <LinkButton label={track.words.open} expanded={popover.open} onClick={popover.openMenu}>
        {track.label}
      </LinkButton>
      <Popover
        open={popover.open}
        anchorEl={popover.anchorEl}
        onClose={popover.closeMenu}
        // Under the track, as the header's line centers it
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
        slotProps={{ paper: { role: "dialog", "aria-label": track.words.levels } }}
      >
        <Stack spacing={1} sx={{ p: 2 }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <SubsectionTitle>
              {trackLink ? (
                <MuiLink component={Link} to={trackLink} target="_blank" underline="hover">
                  {track.name}
                </MuiLink>
              ) : (
                track.name
              )}
            </SubsectionTitle>
            {onAddLevel && (
              // An editor's plus, at the end of the track's name: an advancement on it
              <RowAction
                icon={AddIcon}
                label={track.words.add}
                onClick={popover.closeMenuAnd(() => onAddLevel(track.id))}
              />
            )}
          </Stack>
          <Stack>
            {track.advancements.map((advancement) => (
              <Stack
                key={advancement.id}
                direction="row"
                spacing={2}
                sx={{ alignItems: "center", justifyContent: "space-between", py: 0.5, ...ROW_ACTIONS_HOVER_SX }}
              >
                <Typography variant="body2">{advancement.label}</Typography>
                {onEditLevel && (
                  <RowActions>
                    <RowAction
                      icon={EditIcon}
                      label={advancement.edit}
                      onClick={popover.closeMenuAnd(() => onEditLevel({ characterLevelId: advancement.id }))}
                    />
                  </RowActions>
                )}
              </Stack>
            ))}
          </Stack>
        </Stack>
      </Popover>
    </>
  );
}
