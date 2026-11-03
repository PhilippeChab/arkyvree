/** How text is cut to its room: clamped to a number of lines. */

/** A text's style that clamps it to `lines` lines, the last one ending in an ellipsis. */
export function lineClampSx(lines: number) {
  return { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" } as const;
}
