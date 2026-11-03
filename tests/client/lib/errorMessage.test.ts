import { describe, expect, test } from "bun:test";

import { saveBusy } from "@/client/src/lib/errorMessage.ts";
import { ApiError } from "@/client/src/services/ApiError.ts";

describe("saveBusy", () => {
  test("tells a save that gave up on a lock from a conflict that stands", () => {
    expect(saveBusy(new ApiError("Try again", 409, "BusyError"))).toBe(true);
    expect(saveBusy(new ApiError("Invite is no longer pending", 409, "ConflictError"))).toBe(false);
    expect(saveBusy(new Error("Try again"))).toBe(false);
  });
});
