import { describe, expect, test } from "bun:test";

import { editConflict, saveBusy } from "@/client/src/lib/errorMessage.ts";
import { ApiError } from "@/client/src/services/ApiError.ts";

describe("editConflict", () => {
  test("tells a save refused as stale from a lock's give-up and from other failures", () => {
    const stale = new ApiError(
      "This was modified by someone else. Please refresh and try again.",
      409,
      "ConflictError",
    );
    expect(editConflict(stale)).toBe(true);
    expect(editConflict(new ApiError("Try again", 409, "BusyError"))).toBe(false);
    expect(editConflict(new ApiError("Not found", 404, "NotFoundError"))).toBe(false);
    expect(editConflict(new Error("Network error"))).toBe(false);
  });
});

describe("saveBusy", () => {
  test("tells a save that gave up on a lock from a conflict that stands", () => {
    expect(saveBusy(new ApiError("Try again", 409, "BusyError"))).toBe(true);
    expect(saveBusy(new ApiError("Invite is no longer pending", 409, "ConflictError"))).toBe(false);
    expect(saveBusy(new Error("Try again"))).toBe(false);
  });
});
