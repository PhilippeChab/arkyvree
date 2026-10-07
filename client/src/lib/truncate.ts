/** `text` cut to `length` characters, its cut marked with "…": a description in a tooltip or an option's line. */
export function truncate(text: string, length: number) {
  return text.length > length ? `${text.slice(0, length)}…` : text;
}
