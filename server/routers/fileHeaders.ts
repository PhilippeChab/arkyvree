/** The headers a route sends a file with: its type, and how a browser takes it, under its name. */

/** What isn't a printable ASCII character a quoted header value holds: its name's fallback replaces it. */
const NON_ASCII = /[^\x20-\x7e]|["\\]/g;

/**
 * A file's headers: its media type, and whether a browser shows it or saves it (`disposition`) under its name, which
 * a header holds as ASCII (`filename`, a non-ASCII character replaced) and whole (`filename*`, UTF-8, RFC 6266): a
 * character's name in any script names its PDF, which a raw header value would refuse.
 */
export function buildFileHeaders(file: { disposition: "attachment" | "inline"; fileName: string; mimeType: string }) {
  const fallback = file.fileName.replaceAll(NON_ASCII, "_");
  return {
    "Content-Disposition": `${file.disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    "Content-Type": file.mimeType,
  };
}
