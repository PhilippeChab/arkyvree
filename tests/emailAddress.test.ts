import { describe, expect, test } from "bun:test";

import { sanitizeEmail } from "@/server/emailAddress.ts";

describe("An email address", () => {
  test("is stored trimmed, Unicode-normalized and lowercased", () => {
    expect(sanitizeEmail(" Elara@Example.COM ")).toBe("elara@example.com");
  });
});
