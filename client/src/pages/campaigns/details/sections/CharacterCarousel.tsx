import { Box, IconButton, Stack } from "@mui/material";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import { ChevronLeftIcon, ChevronRightIcon } from "@/client/src/components/icons/index.ts";
import { PREFERS_REDUCED_MOTION } from "@/client/src/theme/animations.ts";
import { TOOLBAR_HEIGHT } from "@/client/src/theme/appTheme.ts";

import { groupPartyColumns } from "./partyColumns.ts";

interface CharacterCarouselProps {
  /**
   * Its characters, in order, each its key, its card, which fills its place (`height: 100%`) and scrolls within it (a
   * `ListCard` that `scrolls`), and whether its reader sees it partly, a short card (`groupPartyColumns`).
   */
  characters: { card: ReactNode; isPartial: boolean; key: string }[];
}

/** Whether the track can slide no further back (`atStart`) or on (`atEnd`). */
interface TrackEdges {
  atEnd: boolean;
  atStart: boolean;
}

/**
 * The row's own height around its columns, which the screen's height less the app bar leaves them: its buttons and
 * their gap (48px), the track's paddings (24px), and 24px to spare.
 */
const ROW_CHROME = 96;

/**
 * A column's height: the screen's, less the app bar and the row's own (added as a negative length), within a phone's
 * least and a desktop's most.
 */
const COLUMN_HEIGHTS = {
  xs: `clamp(420px, calc(100dvh + ${-(TOOLBAR_HEIGHT.xs + ROW_CHROME)}px), 760px)`,
  sm: `clamp(420px, calc(100dvh + ${-(TOOLBAR_HEIGHT.sm + ROW_CHROME)}px), 760px)`,
} as const;

/**
 * A column: as tall as the screen leaves it; a phone's width less a peek of the next, then a fixed width: past a
 * tablet's, two show whole, and a third peeks in. Its cards stand 24px apart, and it stops at its start as the row
 * scrolls.
 */
const COLUMN_SX = {
  flexShrink: 0,
  width: { xs: "calc(100% - 48px)", sm: 440, md: 480 },
  height: COLUMN_HEIGHTS,
  scrollSnapAlign: "start",
} as const;

/** The least height of a column whose short card leaves room under it for the next one, its header and more. */
const PAIRING_HEIGHT = 620;

/** A card's place in its column: as tall as its card, but the column's last, which shrinks to what the others leave. */
const SLOT_SX = { flex: "0 0 auto", minHeight: 0, "&:last-child": { flexShrink: 1 } } as const;

/**
 * The track's own padding at each side, from the app's area's edge (`AppMain`'s, a size container: `cqw`) to the page's
 * column's, so its first and last columns line up with the page: half the area less half the page's width (1200px,
 * `AppMain`'s), plus its `Container`'s gutter (16px on a phone, 24px past it), never less than that gutter. Written in
 * the area's units alone: a scroll padding's `%` would read the track's own width.
 */
const TRACK_INSET = { xs: "max(16px, calc(50cqw - 584px))", sm: "max(24px, calc(50cqw - 576px))" } as const;

/**
 * Its track: the columns in a row that scrolls sideways, smoothly but for a viewer who asked for less motion, past the
 * page's column across the whole of the app's area, its columns stopping in line with the page's; room above them for a
 * card's lift on hover, and below for the scrollbar.
 */
const TRACK_SX = {
  position: "relative",
  left: "calc(50% - 50cqw)",
  width: "100cqw",
  px: TRACK_INSET,
  scrollPaddingInline: TRACK_INSET,
  overflowX: "auto",
  overflowY: "hidden",
  overscrollBehaviorX: "contain",
  scrollSnapType: "x mandatory",
  scrollBehavior: "smooth",
  pt: 1,
  pb: 2,
  [PREFERS_REDUCED_MOTION]: { scrollBehavior: "auto" },
} as const;

/** The track's edges as it's scrolled now, `previous` kept when they didn't change: its state renders nothing again. */
function edgesOf(track: HTMLElement, previous: TrackEdges) {
  const atStart = track.scrollLeft <= 1;
  const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;
  return atStart === previous.atStart && atEnd === previous.atEnd ? previous : { atStart, atEnd };
}

/** Whether a column, as the screen's height leaves it before it's laid out, leaves room under a short card. */
function pairsAtFirst() {
  const height = Math.min(Math.max(window.innerHeight - TOOLBAR_HEIGHT.sm - ROW_CHROME, 420), 760);
  return height >= PAIRING_HEIGHT;
}

/** Slides the track a column back (`-1`) or on (`1`): its first column's width and the gap after it. */
function slide(track: HTMLElement, direction: number) {
  const first = track.firstElementChild;
  const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
  const width = first ? first.getBoundingClientRect().width + gap : track.clientWidth;
  track.scrollBy({ left: direction * width });
}

/**
 * Characters' cards in columns of the screen's height, which slide sideways a column at a time: swiped, scrolled
 * sideways (the wheel with Shift held), or with the previous and next buttons above them (with two columns or more,
 * each disabled at its end). A card scrolls within its column, the wheel scrolling it; a partly seen character's,
 * short, leaves the rest of its column to the next where the column is tall enough to show both. A campaign's
 * characters in its Party View.
 */
export function CharacterCarousel({ characters }: CharacterCarouselProps) {
  const trackId = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<TrackEdges>({ atStart: true, atEnd: true });
  const [pairs, setPairs] = useState(pairsAtFirst);
  const columns = groupPartyColumns(characters, pairs);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const update = () => {
      setEdges((previous) => edgesOf(track, previous));
      // Its columns' height as laid out, which a short card leaves room under or not
      const column = track.firstElementChild;
      if (column) setPairs(column.clientHeight >= PAIRING_HEIGHT);
    };
    // Its first edges once it's laid out, then as its size changes or a page of cards comes in
    const resizes = new ResizeObserver(update);
    resizes.observe(track);
    const added = new MutationObserver(update);
    added.observe(track, { childList: true });
    return () => {
      resizes.disconnect();
      added.disconnect();
    };
  }, []);

  const handlePrevious = () => {
    if (trackRef.current) slide(trackRef.current, -1);
  };
  const handleNext = () => {
    if (trackRef.current) slide(trackRef.current, 1);
  };

  return (
    <Stack spacing={1}>
      {columns.length > 1 && (
        <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
          <IconButton
            aria-label="Previous Characters"
            aria-controls={trackId}
            disabled={edges.atStart}
            onClick={handlePrevious}
          >
            <ChevronLeftIcon />
          </IconButton>
          <IconButton aria-label="Next Characters" aria-controls={trackId} disabled={edges.atEnd} onClick={handleNext}>
            <ChevronRightIcon />
          </IconButton>
        </Stack>
      )}
      <Stack
        ref={trackRef}
        id={trackId}
        direction="row"
        spacing={3}
        useFlexGap
        role="region"
        aria-roledescription="carousel"
        aria-label="Party"
        onScroll={(event) => {
          const track = event.currentTarget;
          setEdges((previous) => edgesOf(track, previous));
        }}
        sx={TRACK_SX}
      >
        {columns.map((column) => (
          // Keyed by its first character, its cards by theirs
          <Stack key={column[0].key} spacing={3} useFlexGap sx={COLUMN_SX}>
            {column.map(({ key, card }) => (
              <Box key={key} sx={SLOT_SX}>
                {card}
              </Box>
            ))}
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}
