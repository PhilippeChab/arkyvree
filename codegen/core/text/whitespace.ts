/** Text with its runs of whitespace (newlines included) as single spaces, trimmed. */
export function normalizeWs(text: string) {
  return text.replace(/\s+/g, " ").trim();
}
