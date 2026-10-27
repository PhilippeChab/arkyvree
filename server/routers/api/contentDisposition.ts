/**
 * A file's `Content-Disposition`, shown in the browser (`inline`) or saved (`attachment`), by its name whatever its
 * characters: a header holds Latin-1 alone, so the name is sent percent-encoded as UTF-8 (RFC 6266's `filename*`, which
 * leaves `'`, `(`, `)` and `*` encoded too), a lone half of a character replaced first, since it has no UTF-8.
 */
export function formatContentDisposition(kind: "attachment" | "inline", fileName: string) {
  const encoded = encodeURIComponent(fileName.toWellFormed()).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${kind}; filename*=UTF-8''${encoded}`;
}
