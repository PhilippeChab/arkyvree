import { Avatar, Box, Card, type CardProps, Stack, type Theme, Typography } from "@mui/material";
import { type ReactNode, type UIEvent, useEffect, useRef, useState } from "react";

import { DURATION, EASING, fadeInUpSx, PREFERS_REDUCED_MOTION, transitionOf } from "@/client/src/theme/animations.ts";
import { lineClampSx } from "@/client/src/theme/text.ts";

import { CLICKABLE_SX, clickableProps } from "./clickable.ts";
import { NO_DESCRIPTION } from "./EmptyValue.tsx";

interface ListCardGridProps {
  children: ReactNode;
}

interface ListCardProps extends Omit<CardProps, "children" | "title"> {
  /** A control at the end of the title's row, as wide as it needs: a campaign character's card's visibility. */
  action?: ReactNode;
  /** Its place in the list, which staggers its entry (`fadeInUpSx`), from the page that came in (`animationOffset`). */
  animationIndex?: number;
  animationOffset?: number;
  /** Defaults to the title's initial. */
  avatar?: ReactNode;
  avatarSrc?: string;
  /** Brand colour of the avatar's gradient. */
  avatarTone?: "primary" | "secondary";
  /** What it shows under its description: a campaign character's sheet in brief, in its Party View. */
  children?: ReactNode;
  /** Its facts, under its title: chips of the family, as its page's header shows them. */
  chips?: ReactNode;
  /** Corner control, e.g. a star toggle. */
  corner?: ReactNode;
  description: string | null | undefined;
  /** Marks the card with the warning stripe and border: a private one says so in its chip */
  isArchived?: boolean;
  /** Opens its record, from a click or the keyboard (`clickableProps`). */
  onClick: () => void;
  /**
   * Its description, whole, and what's under it scroll under its header, which stays, within the height its place gives
   * it (its column's in a campaign's Party View), their edges fading where they hold more; while they hold more than
   * they show, they take focus, so the keyboard scrolls them too.
   */
  scrolls?: boolean;
  title: string;
}

/** Whether a scrolling body holds more than it shows above (`above`) and below (`below`). */
interface Overflow {
  above: boolean;
  below: boolean;
}

/** How deep a scrolling body fades where it holds more: a fold under its header, a deeper one at its foot. */
const FADE_ABOVE = 24;
const FADE_BELOW = 48;

/** A scrolling body's mask: its edges fade where it holds more, so a card cut short reads as one that scrolls. */
function fadeSx({ above, below }: Overflow) {
  if (!above && !below) return false;
  return {
    maskImage: (theme: Theme) => {
      const ink = theme.palette.common.black;
      const top = above ? `transparent, ${ink} ${FADE_ABOVE}px` : ink;
      const bottom = below ? `${ink} calc(100% - ${FADE_BELOW}px), transparent` : ink;
      return `linear-gradient(to bottom, ${top}, ${bottom})`;
    },
  };
}

/** A scrolling body's overflow as it's scrolled now, `previous` kept when it didn't change: its state renders none. */
function overflowOf(body: HTMLElement, previous: Overflow) {
  const above = body.scrollTop > 1;
  const below = body.scrollTop + body.clientHeight < body.scrollHeight - 1;
  return above === previous.above && below === previous.below ? previous : { above, below };
}

/** Card of the ruleset, character and campaign grids, and of a campaign's Party View. */
export function ListCard({
  action,
  avatar,
  avatarTone = "primary",
  avatarSrc,
  title,
  corner,
  chips,
  children,
  description,
  isArchived = false,
  animationIndex,
  animationOffset,
  onClick,
  scrolls = false,
  sx,
  ...props
}: ListCardProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState<Overflow>({ above: false, below: false });

  useEffect(() => {
    const body = bodyRef.current;
    if (!scrolls || !body) return;
    const update = () => setOverflow((previous) => overflowOf(body, previous));
    // Its first overflow once it's laid out, then as its height or what it holds changes (a sheet that comes in)
    const resizes = new ResizeObserver(update);
    const observeAll = () => {
      resizes.observe(body);
      for (const block of body.children) resizes.observe(block);
    };
    observeAll();
    const blocks = new MutationObserver(observeAll);
    blocks.observe(body, { childList: true });
    return () => {
      resizes.disconnect();
      blocks.disconnect();
    };
  }, [scrolls]);

  return (
    <Card
      elevation={0}
      {...clickableProps(onClick)}
      sx={[
        {
          height: "100%",
          border: 1,
          borderColor: isArchived ? "warning.light" : "divider",
          borderRadius: 3,
          overflow: "hidden",
          transition: transitionOf(["all"], DURATION.moderate, EASING.standard),
          position: "relative",
          bgcolor: "background.paper",
          opacity: isArchived ? 0.9 : 1,
          "&:before": {
            content: '""',
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 4,
            background: (theme) =>
              isArchived
                ? `linear-gradient(90deg, ${theme.palette.warning.main}, ${theme.palette.warning.dark})`
                : `linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
          },
        },
        CLICKABLE_SX,
        {
          "&:hover": {
            borderColor: isArchived ? "warning.main" : "secondary.main",
            boxShadow: (theme) => (isArchived ? theme.boxShadows.archivedCardHover : theme.boxShadows.cardHover),
            transform: "translateY(-4px)",
            opacity: 1,
          },
          [PREFERS_REDUCED_MOTION]: {
            "&:hover": { transform: "none" },
          },
        },
        // Clipped, never scrolled: focus moving into its body scrolls the body alone
        scrolls && { overflow: "clip" },
        animationIndex != null && fadeInUpSx(animationIndex, animationOffset),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...props}
    >
      {/* The card's content is a column, its description and what's under it filling what's left, or, held within its
          height, scrolling under its header */}
      <Stack sx={{ height: "100%" }}>
        {/* The header's inner space, down to the description: deeper under the chips */}
        <Stack
          spacing={1.5}
          sx={{
            p: { xs: 2, sm: 3 },
            pb: chips ? { xs: 3.5, sm: 4 } : { xs: 3, sm: 3.5 },
            position: "relative",
            flexShrink: 0,
          }}
        >
          {corner && <Box sx={{ position: "absolute", top: 8, right: 8 }}>{corner}</Box>}
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0, pr: corner ? 4 : 0 }}>
            <Avatar
              src={avatarSrc}
              sx={{
                width: 36,
                height: 36,
                border: 2,
                borderColor: "secondary.main",
                background: (theme) =>
                  `linear-gradient(135deg, ${theme.palette[avatarTone].light}, ${theme.palette[avatarTone].main})`,
                fontSize: "1rem",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {avatar ?? title.charAt(0).toUpperCase()}
            </Avatar>
            <Typography
              variant="h6"
              component="h2"
              noWrap
              sx={{ fontWeight: 600, color: "text.primary", lineHeight: 1.3, flex: 1 }}
            >
              {title}
            </Typography>
            {action}
          </Stack>
          {chips && (
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
              {chips}
            </Stack>
          )}
        </Stack>
        <Stack
          ref={bodyRef}
          spacing={3}
          {...(scrolls && {
            role: "group",
            "aria-label": `${title} Details`,
            tabIndex: overflow.above || overflow.below ? 0 : undefined,
            onScroll: (event: UIEvent<HTMLDivElement>) => {
              const body = event.currentTarget;
              setOverflow((previous) => overflowOf(body, previous));
            },
          })}
          sx={[
            { px: { xs: 2, sm: 3 }, pb: { xs: 2, sm: 3 }, flex: 1 },
            // Scrolling, its blocks keep their heights: a description would shrink away
            scrolls && { ...CLICKABLE_SX, minHeight: 0, overflowY: "auto", "& > *": { flexShrink: 0 } },
            scrolls && fadeSx(overflow),
          ]}
        >
          <Typography
            variant="body2"
            sx={[
              { color: "text.secondary", lineHeight: 1.6 },
              // In a grid, four lines, no more and no fewer, so the cards of a row line up
              !scrolls && { ...lineClampSx(4), minHeight: "6.4em" },
            ]}
          >
            {description || NO_DESCRIPTION}
          </Typography>
          {children}
        </Stack>
      </Stack>
    </Card>
  );
}

/** Responsive grid the list cards sit in. */
export function ListCardGrid({ children }: ListCardGridProps) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" },
        gap: 3,
      }}
    >
      {children}
    </Box>
  );
}
