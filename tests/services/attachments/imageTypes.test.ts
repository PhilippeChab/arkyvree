import { describe, expect, test } from "bun:test";

import { detectImageType } from "@/server/services/attachments/imageTypes.ts";

/** Bytes that open with `head`, padded to 16. */
function bytes(...head: number[]) {
  const data = new Uint8Array(16);
  data.set(head);
  return data;
}

describe("detectImageType", () => {
  test("reads a PNG, a JPEG, a GIF and a WebP by the bytes they open with", () => {
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(detectImageType(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe("image/gif");
    const riff = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0];
    expect(detectImageType(bytes(...riff, 0x57, 0x45, 0x42, 0x50))).toBe("image/webp");
  });

  test("reads no image in other bytes: text, a RIFF file of another form (a WAV), a file too short", () => {
    expect(detectImageType(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(detectImageType(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45))).toBeNull();
    expect(detectImageType(new Uint8Array([0x89, 0x50]))).toBeNull();
  });
});
