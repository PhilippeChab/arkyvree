/** The image type an upload's bytes say it is, which its declared type can't change. */

/** Each image type by the bytes its files hold, each run at its offset: a WebP is a RIFF file whose form is `WEBP`. */
const SIGNATURES: readonly { runs: (readonly [offset: number, bytes: readonly number[]])[]; type: string }[] = [
  { runs: [[0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]]], type: "image/png" },
  { runs: [[0, [0xff, 0xd8, 0xff]]], type: "image/jpeg" },
  { runs: [[0, [0x47, 0x49, 0x46, 0x38]]], type: "image/gif" },
  {
    runs: [
      [0, [0x52, 0x49, 0x46, 0x46]],
      [8, [0x57, 0x45, 0x42, 0x50]],
    ],
    type: "image/webp",
  },
];

/** The image type a file's bytes open with (PNG, JPEG, GIF, WebP), or null for any other file. */
export function detectImageType(data: Uint8Array): string | null {
  const match = SIGNATURES.find(({ runs }) =>
    runs.every(([offset, bytes]) => bytes.every((byte, i) => data[offset + i] === byte)),
  );
  return match?.type ?? null;
}
