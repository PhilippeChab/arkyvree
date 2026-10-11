import { describe, expect, test } from "bun:test";

import { EMPTY_VERIFICATION_CODE, isCodeComplete } from "@/client/src/components/auth/verificationCode.ts";
import { VERIFICATION_CODE_LENGTH } from "@/shared/auth.ts";

describe("A verification code's field", () => {
  test("starts with one empty box per digit", () => {
    expect(EMPTY_VERIFICATION_CODE).toEqual(Array.from({ length: VERIFICATION_CODE_LENGTH }, () => ""));
  });

  test("can be sent once every box holds its digit", () => {
    const full = Array.from({ length: VERIFICATION_CODE_LENGTH }, (_, index) => String(index % 10));
    expect(isCodeComplete(full)).toBe(true);
    expect(isCodeComplete(EMPTY_VERIFICATION_CODE)).toBe(false);
    expect(isCodeComplete(full.with(3, ""))).toBe(false);
  });
});
