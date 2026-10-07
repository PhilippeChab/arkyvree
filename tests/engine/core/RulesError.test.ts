import { describe, expect, test } from "bun:test";

import RulesError from "@/engine/core/RulesError.ts";
import { BadRequestError, ConflictError, toJson, UnprocessableEntityError } from "@/server/errors/index.ts";

describe("A ruleset's refusal", () => {
  test("is answered as the server's error of its kind: its status, name, cause and message", () => {
    expect(toJson(new RulesError("invalid", "No"))).toEqual(toJson(new BadRequestError("No")));
    expect(toJson(new RulesError("unprocessable", "No"))).toEqual(toJson(new UnprocessableEntityError("No")));
    expect(toJson(new RulesError("conflict", "No"))).toEqual(toJson(new ConflictError("No")));
  });
});
