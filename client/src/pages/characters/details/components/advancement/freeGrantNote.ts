/**
 * What a granted pick that takes no slot of its pool says after its name (`note`, its rules' "class ability"), in its
 * step and in the review.
 */
export function freeGrantNote(note: string | undefined) {
  return note ? ` (${note})` : "";
}
