import { Collapse, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

import { CLICKABLE_SX, toggleProps } from "./clickable.ts";
import { ExpandArrow } from "./ExpandArrow.tsx";

interface SubsectionProps {
  title: ReactNode;
  /** Its heading's level: `h3` within a panel, a dialog or a step, `h4` within those */
  level?: "h3" | "h4";
  /** Beside the title, at the row's end */
  action?: ReactNode;
  /** Under the title, open or closed: a feat's description above what opens */
  summary?: ReactNode;
  /** Given, the subsection opens and closes from its title, and its content shows while it's open */
  onToggle?: () => void;
  open?: boolean;
  children?: ReactNode;
}

/** The look each heading level takes, as `headings` sets it */
const VARIANTS = { h3: "h6", h4: "subtitle1" } as const;

/**
 * A titled group within a panel, a dialog or a step: its heading, an action beside it, its content 1 apart. One that
 * opens and closes is a heading holding its toggle, which fills it, the arrow leading the title.
 */
export function Subsection({
  title,
  level = "h3",
  action,
  summary,
  onToggle,
  open = false,
  children,
}: SubsectionProps) {
  const heading = (
    <Typography component={level} variant={VARIANTS[level]}>
      {onToggle ? (
        <Stack
          component="span"
          direction="row"
          spacing={0.5}
          {...toggleProps(open, onToggle)}
          sx={{ alignItems: "center", ...CLICKABLE_SX }}
        >
          <ExpandArrow open={open} />
          <span>{title}</span>
        </Stack>
      ) : (
        title
      )}
    </Typography>
  );

  return (
    <Stack spacing={1}>
      {action ? (
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}
        >
          {heading}
          {action}
        </Stack>
      ) : (
        heading
      )}
      {summary}
      {onToggle ? (
        <Collapse in={open} unmountOnExit>
          {children}
        </Collapse>
      ) : (
        children
      )}
    </Stack>
  );
}
