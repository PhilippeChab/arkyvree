import { Box, IconButton, Stack } from "@mui/material";
import { Children, type ReactNode, useEffect, useId, useRef, useState } from "react";

import { ChevronLeftIcon, ChevronRightIcon } from "@/client/src/components/icons/index.ts";
import { PREFERS_REDUCED_MOTION } from "@/client/src/theme/animations.ts";

interface CharacterCarouselProps {
  /**
   * Its columns, in order, each its key and its cards, top to bottom (`groupPartyColumns`): a card fills its height
   * (`height: 100%`), and one that `scrolls` (a `ListCard`'s) scrolls within it.
   */
  columns: { cards: ReactNode[]; key: string }[];
}

/** Whether the track can slide no further back (`atStart`) or on (`atEnd`). */
interface TrackEdges {
  atEnd: boolean;
  atStart: boolean;
}

/**
 * A column: the screen's height less the app bar and the row's buttons, within a phone's least and a desktop's most; a
 * phone's width less a peek of the next, then a fixed width: past a tablet's, two show whole, and a third peeks in. Its
 * cards stand 24px apart, and it stops at its start as the row scrolls.
 */
const COLUMN_SX = {
  flexShrink: 0,
  width: { xs: "calc(100% - 48px)", sm: 440, md: 480 },
  height: "clamp(420px, calc(100dvh - 160px), 760px)",
  scrollSnapAlign: "start",
} as const;

/** A card's place in its column: as tall as its card, but the column's last, which takes what the others leave. */
const SLOT_SX = { flex: "0 0 auto", minHeight: 0, "&:last-child": { flexShrink: 1 } } as const;

/**
 * Its track: the columns in a row that scrolls sideways, smoothly but for a viewer who asked for less motion; room
 * above them for a card's lift on hover, and below for the scrollbar.
 */
const TRACK_SX = {
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

/** Slides the track a column back (`-1`) or on (`1`): its first column's width and the gap after it. */
function slide(track: HTMLElement, direction: number) {
  const first = track.firstElementChild;
  const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
  const width = first ? first.getBoundingClientRect().width + gap : track.clientWidth;
  track.scrollBy({ left: direction * width });
}

/**
 * Cards in columns of the screen's height, which slide sideways a column at a time: swiped, scrolled sideways (the
 * wheel with Shift held), or with the previous and next buttons above them (with two columns or more, each disabled at
 * its end). A card scrolls within its column, the wheel scrolling it. A campaign's characters in its Party View.
 */
export function CharacterCarousel({ columns }: CharacterCarouselProps) {
  const trackId = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<TrackEdges>({ atStart: true, atEnd: true });

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const update = () => setEdges((previous) => edgesOf(track, previous));
    // Its first edges once it's laid out, then as its width changes or a page of cards comes in
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
            aria-label="Previous Character"
            aria-controls={trackId}
            disabled={edges.atStart}
            onClick={handlePrevious}
          >
            <ChevronLeftIcon />
          </IconButton>
          <IconButton aria-label="Next Character" aria-controls={trackId} disabled={edges.atEnd} onClick={handleNext}>
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
        {columns.map(({ key, cards }) => (
          <Stack key={key} spacing={3} useFlexGap sx={COLUMN_SX}>
            {Children.map(cards, (card) => (
              <Box sx={SLOT_SX}>{card}</Box>
            ))}
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}
