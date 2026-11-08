import { IconButton, Stack } from "@mui/material";
import { Children, type ReactNode, useEffect, useId, useRef, useState } from "react";

import { ChevronLeftIcon, ChevronRightIcon } from "@/client/src/components/icons/index.ts";
import { DURATION, PREFERS_REDUCED_MOTION } from "@/client/src/theme/animations.ts";

interface CharacterCarouselProps {
  /** Its cards, side by side, each a slide as wide as the screen gives it. */
  children: ReactNode;
}

/** Whether the track can slide no further back (`atStart`) or on (`atEnd`). */
interface TrackEdges {
  atEnd: boolean;
  atStart: boolean;
}

/**
 * Its track: its cards in a row that scrolls sideways, each stopping at its start, smoothly but for a viewer who asked
 * for less motion, and each as tall as it needs; room above them for a card's lift on hover, and below for the
 * scrollbar. A card is a phone's width less a peek of the next, then a fixed width: past a tablet's, two show whole,
 * and a third peeks in.
 */
const TRACK_SX = {
  alignItems: "flex-start",
  overflowX: "auto",
  overscrollBehaviorX: "contain",
  scrollSnapType: "x mandatory",
  scrollBehavior: "smooth",
  pt: 1,
  pb: 2,
  "& > *": { flexShrink: 0, width: { xs: "calc(100% - 48px)", sm: 440, md: 480 }, scrollSnapAlign: "start" },
  [PREFERS_REDUCED_MOTION]: { scrollBehavior: "auto" },
} as const;

/** How long a wheel turned on keeps to the slide it moved: a notch slides one card, however many events it fires. */
const WHEEL_SLIDE_GAP = DURATION.slow;

/** The track's edges as it's scrolled now, `previous` kept when they didn't change, so its state doesn't render again. */
function edgesOf(track: HTMLElement, previous: TrackEdges) {
  const atStart = track.scrollLeft <= 1;
  const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;
  return atStart === previous.atStart && atEnd === previous.atEnd ? previous : { atStart, atEnd };
}

/** Slides the track a card back (`-1`) or on (`1`): its first card's width and the gap after it. */
function slide(track: HTMLElement, direction: number) {
  const first = track.firstElementChild;
  const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
  const width = first ? first.getBoundingClientRect().width + gap : track.clientWidth;
  track.scrollBy({ left: direction * width });
}

/**
 * Cards in a row that slides sideways, a card at a time: swiped, scrolled sideways, its previous and next buttons above
 * it (with two cards or more, each disabled at its end), or the mouse wheel over it, which slides it on as it turns
 * down and back as it turns up, and scrolls the page once the row can't slide further that way. A campaign's
 * characters in its Party View.
 */
export function CharacterCarousel({ children }: CharacterCarouselProps) {
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
    const cards = new MutationObserver(update);
    cards.observe(track, { childList: true });
    let lastSlide = Number.NEGATIVE_INFINITY;
    const handleWheel = (event: WheelEvent) => {
      // A sideways scroll moves the track itself, and a wheel past its end the page
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const direction = Math.sign(event.deltaY);
      const { atStart, atEnd } = edgesOf(track, { atStart: true, atEnd: true });
      if (direction < 0 ? atStart : atEnd) return;
      event.preventDefault();
      if (event.timeStamp - lastSlide < WHEEL_SLIDE_GAP) return;
      lastSlide = event.timeStamp;
      slide(track, direction);
    };
    // Not passive: a wheel that slides the track doesn't scroll the page
    track.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      resizes.disconnect();
      cards.disconnect();
      track.removeEventListener("wheel", handleWheel);
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
      {Children.count(children) > 1 && (
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
        {children}
      </Stack>
    </Stack>
  );
}
