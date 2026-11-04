import { Box, ButtonBase, Tooltip } from "@mui/material";
import { Fragment, type MouseEvent } from "react";

import type { PositionWord } from "@/client/src/lib/rulesetLabels.ts";

interface OwnedTogglesProps {
  /** What the toggles grant, which each one's label names ("Evasion at level 2") */
  label: string;
  /** A toggle's note, which its tooltip says; none for most */
  noteOf?: (ownedId: string) => ToggleNote | undefined;
  /** An owned entity's toggle was clicked, which a box can open under (`target`) */
  onToggle: (ownedId: string, target: HTMLElement) => void;
  /** The owner's owned entities, each its number (`position`) */
  ownedEntities: readonly { id: string; position: number }[];
  /**
   * Its rules' word for an owned entity's position along its owner, which names one ("Level 3"), and several ("Levels")
   */
  positionWord: PositionWord;
  /** Read-only: nothing to click */
  readOnly?: boolean;
  /** What an owned entity holds as saved: a changed toggle is outlined */
  saved: (ownedId: string) => number;
  /** What an owned entity holds: 0 is off, a count above 1 shows on its toggle */
  value: (ownedId: string) => number;
}

/**
 * What a toggle's tooltip says of it: that a click moves its row's grant there (`move`: a feature granted at one owned entity
 * only, at another), or that what it holds gives nothing (`idle`: that feature's owned entity past its first, saved before the
 * rule).
 */
export interface ToggleNote {
  kind: "idle" | "move";
  text: string;
}

/** The toggles a phone's line holds: ten, so a class's 20 levels take two lines and none scrolls out of sight. */
const PHONE_TOGGLES = 10;

/**
 * One toggle an owned entity, filled where something is granted, outlined where the tab changed it before its save. A
 * toggle with a note says it in its tooltip, which a screen reader reads as its description; one whose grant gives
 * nothing is struck through, and a click clears it. Every toggle sits in a tooltip, an empty one without a note, so a
 * click that changes its note keeps the toggle, and its focus.
 */
export function OwnedToggles({
  label,
  noteOf,
  ownedEntities,
  onToggle,
  positionWord,
  readOnly,
  saved,
  value,
}: OwnedTogglesProps) {
  return (
    <Box
      role="group"
      aria-label={`${positionWord.many} of ${label}`}
      sx={{
        display: "grid",
        // On a phone, ten a line (a class's 20 levels on two); from sm up, one line
        gridTemplateColumns: {
          xs: `repeat(${Math.min(Math.max(ownedEntities.length, 1), PHONE_TOGGLES)}, minmax(0, 1fr))`,
          sm: `repeat(${Math.max(ownedEntities.length, 1)}, minmax(24px, 1fr))`,
        },
        gap: 0.5,
      }}
    >
      {ownedEntities.map(({ id, position }) => {
        const count = value(id);
        const changed = count !== saved(id);
        const note = noteOf?.(id);
        const idle = note?.kind === "idle" && count > 0;
        const filled = count > 0 && !idle;
        const handleClick = (event: MouseEvent<HTMLElement>) => onToggle(id, event.currentTarget);
        const toggle = (
          <ButtonBase
            disabled={readOnly}
            aria-pressed={count > 0}
            aria-label={`${positionWord.one} ${position}: ${label}${count > 1 ? `, ${count} Picks` : ""}${readOnly && idle ? `. ${note.text}` : ""}`}
            onClick={handleClick}
            sx={{
              fontSize: "0.72rem",
              fontVariantNumeric: "tabular-nums",
              py: 0.25,
              borderRadius: 0.5,
              border: 1,
              borderStyle: idle ? "dashed" : "solid",
              borderColor: count > 0 ? "primary.main" : "divider",
              bgcolor: filled ? "primary.main" : "background.default",
              color: filled ? "primary.contrastText" : idle ? "primary.main" : "text.secondary",
              fontWeight: count > 0 ? 600 : 400,
              textDecoration: idle ? "line-through" : "none",
              outline: changed ? 2 : 0,
              outlineColor: "secondary.main",
              outlineOffset: 1,
            }}
          >
            {count > 1 ? `${position}×${count}` : position}
          </ButtonBase>
        );
        // Read-only, it takes no click and has no tooltip, its name saying a grant that gives nothing; editable, it
        // never turns disabled under its tooltip
        return readOnly ? (
          <Fragment key={id}>{toggle}</Fragment>
        ) : (
          <Tooltip key={id} title={note?.text ?? ""} describeChild>
            {toggle}
          </Tooltip>
        );
      })}
    </Box>
  );
}
