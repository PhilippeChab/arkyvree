import { Box, DialogTitle, IconButton, Stack } from "@mui/material";
import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { ListPageResults, LoadMoreButton, Modal } from "@/client/src/components/common/index.ts";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "@/client/src/components/icons/index.ts";
import type { useListPageQuery } from "@/client/src/hooks/index.ts";
import { DURATION, PREFERS_REDUCED_MOTION } from "@/client/src/theme/animations.ts";

import { groupPartyColumns } from "./partyColumns.ts";

interface PartyViewDialogProps extends PartyViewProps {
  open: boolean;
}

interface PartyViewProps {
  /**
   * Its characters, in order, each its key, its card, which fills its place (`height: 100%`) and scrolls within it (a
   * `ListCard` that `scrolls`), and whether its reader sees it partly, a short card (`groupPartyColumns`).
   */
  characters: { card: ReactNode; isPartial: boolean; key: string }[];
  /** Its list's own empty state, when it holds nothing and no search runs (a `BlankState`). */
  empty: ReactNode;
  /** Its characters' list (`useListPageQuery`): its first load, its failure and its emptiness show in its place. */
  list: ReturnType<typeof useListPageQuery>;
  /** Its list's next page, while there's one: whether it loads, and what loads it (its row's Load More, at its end). */
  next?: { loading: boolean; onLoad: () => void };
  /** Closes it: its X, Escape. */
  onClose: () => void;
  /** The search its list runs, if any. */
  search: string;
  /** Its title: the campaign's name, and what it is. */
  title: string;
}

/** Whether the track can slide no further back (`atStart`) or on (`atEnd`). */
interface TrackEdges {
  atEnd: boolean;
  atStart: boolean;
}

/**
 * Its header's height and the track's paddings around its columns, which the screen's height less them leaves the
 * columns before they're laid out.
 */
const CHROME = 96;

/**
 * A column: as tall as the track; a phone's width less a peek of the next, then a fixed width: past a tablet's, two
 * show whole on a laptop, more on a wider screen. Its cards stand 24px apart, and it stops at its start as the row
 * scrolls.
 */
const COLUMN_SX = {
  flexShrink: 0,
  width: { xs: "calc(100% - 48px)", sm: 440, md: 480 },
  scrollSnapAlign: "start",
} as const;

/** The row's end, past its last column: what it holds in its middle. */
const END_SX = { flexShrink: 0, justifyContent: "center", px: 3, scrollSnapAlign: "end" } as const;

/** The least height of a column whose short card leaves room under it for the next one, its header and more. */
const PAIRING_HEIGHT = 620;

/**
 * How long the row slides to a new page's first card before it snaps to its columns again: it doesn't snap meanwhile,
 * so the page coming in doesn't make it jump to the nearest column first.
 */
const SETTLE_TIME = DURATION.ring;

/** A card's place in its column: as tall as its card, but the column's last, which shrinks to what the others leave. */
const SLOT_SX = { flex: "0 0 auto", minHeight: 0, "&:last-child": { flexShrink: 1 } } as const;

/**
 * Its track: the columns in a row filling the dialog under its header, which scrolls sideways, smoothly but for a
 * viewer who asked for less motion, each column stopping at the page's gutter; room above them for a card's lift on
 * hover, and below for the scrollbar.
 */
const TRACK_SX = {
  flex: 1,
  minHeight: 0,
  overflowX: "auto",
  overflowY: "hidden",
  overscrollBehaviorX: "contain",
  scrollSnapType: "x mandatory",
  scrollBehavior: "smooth",
  px: { xs: 2, sm: 3 },
  scrollPaddingInline: { xs: "16px", sm: "24px" },
  pt: 1,
  pb: 2,
  [PREFERS_REDUCED_MOTION]: { scrollBehavior: "auto" },
} as const;

/**
 * The pause that ends a turn of the wheel over the row: a turn slides one column, however many events it fires (a
 * notch's, a trackpad flick's and its momentum), each closer to the one before than this.
 */
const WHEEL_TURN_GAP = DURATION.normal;

/** The track's edges as it's scrolled now, `previous` kept when they didn't change: its state renders nothing again. */
function edgesOf(track: HTMLElement, previous: TrackEdges) {
  const atStart = track.scrollLeft <= 1;
  const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;
  return atStart === previous.atStart && atEnd === previous.atEnd ? previous : { atStart, atEnd };
}

/** Whether a column, as the screen's height leaves it before it's laid out, leaves room under a short card. */
function pairsAtFirst() {
  return window.innerHeight - CHROME >= PAIRING_HEIGHT;
}

/**
 * The Party View's content: its header (its title, the previous and next buttons, with two columns or more, each
 * disabled at its end, and its X), then its characters' cards in columns as tall as the screen leaves them, in a row
 * that slides sideways a column at a time: swiped, scrolled sideways (the wheel with Shift held), the wheel turned over
 * the row anywhere but where a card scrolls, or with its buttons. A card scrolls within its column, the wheel over it
 * scrolling it; a partly seen character's, short, leaves the rest of its column to the next where the column is tall
 * enough to show both. Mounted with the dialog's content, so its sheets load as it opens.
 */
function PartyView({ characters, empty, list, next, onClose, search, title }: PartyViewProps) {
  const trackId = useId();
  // The track appears once the list has loaded: its listeners attach to it then
  const [track, setTrack] = useState<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState<TrackEdges>({ atStart: true, atEnd: true });
  const [pairs, setPairs] = useState(pairsAtFirst);
  const columns = groupPartyColumns(characters, pairs);
  // From its Load More's click till it has slid to the page it loaded: the row doesn't snap
  const [settling, setSettling] = useState(false);
  // How many characters it showed: a page that comes in slides the row to its first, before the browser shows it
  const shown = useRef(characters.length);

  useLayoutEffect(() => {
    const first = shown.current;
    shown.current = characters.length;
    if (!track || first === 0 || characters.length <= first) return;
    const key = characters[first]?.key;
    slideTo(
      track,
      columns.findIndex((column) => column.some((placed) => placed.key === key)),
    );
    setTimeout(() => setSettling(false), SETTLE_TIME);
  }, [characters, columns, track]);

  useEffect(() => {
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
    let lastWheel = Number.NEGATIVE_INFINITY;
    const handleWheel = (event: WheelEvent) => {
      // The browser's own: a zoom (Ctrl or Command held), and a wheel it already scrolls with
      if (!event.cancelable || event.ctrlKey || event.metaKey) return;
      // A sideways scroll moves the track itself, and the wheel over a card that scrolls there scrolls the card
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const card = event.target instanceof Element ? event.target.closest("[data-card]") : null;
      if (card && event.target instanceof Element && scrollsInCard(event.target, card)) return;
      const direction = Math.sign(event.deltaY);
      const { atStart, atEnd } = edgesOf(track, { atStart: true, atEnd: true });
      if (direction < 0 ? atStart : atEnd) return;
      event.preventDefault();
      const turns = event.timeStamp - lastWheel >= WHEEL_TURN_GAP;
      lastWheel = event.timeStamp;
      if (turns) slide(track, direction);
    };
    // Not passive: a wheel that slides the row doesn't scroll anything else
    track.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      resizes.disconnect();
      added.disconnect();
      track.removeEventListener("wheel", handleWheel);
    };
  }, [track]);

  const handlePrevious = () => {
    if (track) slide(track, -1);
  };
  const handleNext = () => {
    if (track) slide(track, 1);
  };
  const handleLoadMore = () => {
    setSettling(true);
    next?.onLoad();
  };

  return (
    <Stack sx={{ height: "100%" }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", pr: { xs: 1, sm: 2 } }}>
        <DialogTitle noWrap sx={{ flex: 1, minWidth: 0 }}>
          {title}
        </DialogTitle>
        {(columns.length > 1 || !!next) && (
          <>
            <IconButton
              aria-label="Previous Characters"
              aria-controls={trackId}
              disabled={edges.atStart}
              onClick={handlePrevious}
            >
              <ChevronLeftIcon />
            </IconButton>
            <IconButton
              aria-label="Next Characters"
              aria-controls={trackId}
              disabled={edges.atEnd}
              onClick={handleNext}
            >
              <ChevronRightIcon />
            </IconButton>
          </>
        )}
        <IconButton aria-label="Close Party View" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Stack>
      <Stack sx={{ flex: 1, minHeight: 0 }}>
        <ListPageResults loadsMore variant="section" list={list} search={search} what="Characters" empty={empty}>
          <Stack
            ref={setTrack}
            id={trackId}
            direction="row"
            spacing={3}
            useFlexGap
            role="region"
            aria-roledescription="carousel"
            aria-label="Party"
            onScroll={(event) => {
              const scrolled = event.currentTarget;
              setEdges((previous) => edgesOf(scrolled, previous));
            }}
            sx={[TRACK_SX, settling && { scrollSnapType: "none" }]}
          >
            {columns.map((column) => (
              // Keyed by its first character, its cards by theirs
              <Stack key={column[0].key} spacing={3} useFlexGap sx={COLUMN_SX}>
                {column.map(({ key, card }) => (
                  // A card's place, where the wheel scrolls the card when it holds more than it shows
                  <Box key={key} data-card sx={SLOT_SX}>
                    {card}
                  </Box>
                ))}
              </Stack>
            ))}
            {next && (
              // Its next page loads from its end, sideways
              <Stack spacing={2} sx={END_SX}>
                <LoadMoreButton hasNextPage isFetchingNextPage={next.loading} onClick={handleLoadMore} />
              </Stack>
            )}
          </Stack>
        </ListPageResults>
      </Stack>
    </Stack>
  );
}

/**
 * Whether the wheel over `target` scrolls something of its card (`card`, its place): an element from it up to the card
 * that holds more than it shows, up and down.
 */
function scrollsInCard(target: Element, card: Element) {
  for (let element: Element | null = target; element && element !== card; element = element.parentElement) {
    if (element.scrollHeight <= element.clientHeight + 1) continue;
    const { overflowY } = getComputedStyle(element);
    if (overflowY === "auto" || overflowY === "scroll") return true;
  }
  return false;
}

/** Slides the track a column back (`-1`) or on (`1`): its first column's width and the gap after it. */
function slide(track: HTMLElement, direction: number) {
  const first = track.firstElementChild;
  const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
  const width = first ? first.getBoundingClientRect().width + gap : track.clientWidth;
  track.scrollBy({ left: direction * width });
}

/**
 * Slides the track to its column `index` (a new page's first), stopping at its start: smoothly, but for a viewer who
 * asked for less motion (its scroll behavior).
 */
function slideTo(track: HTMLElement, index: number) {
  const column = track.children[index];
  if (!column) return;
  const inset = Number.parseFloat(getComputedStyle(track).paddingLeft) || 0;
  const offset = column.getBoundingClientRect().left - track.getBoundingClientRect().left;
  track.scrollTo({ left: track.scrollLeft + offset - inset });
}

/**
 * A campaign's Party View: its characters' sheets in brief, side by side, in an overlay that fills the screen, which
 * its X, Escape or Back closes. Mounted with its tab, its `open` showing it, so it fades out as it closes; a new search
 * starts its row at its first column.
 */
export function PartyViewDialog({ open, ...view }: PartyViewDialogProps) {
  return (
    <Modal open={open} onClose={view.onClose} fullScreen maxWidth={false}>
      <PartyView key={view.search} {...view} />
    </Modal>
  );
}
