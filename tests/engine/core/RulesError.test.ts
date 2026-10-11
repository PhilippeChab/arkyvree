import { describe, expect, test } from "bun:test";

import RulesError from "@/engine/core/RulesError.ts";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  toJson,
  UnprocessableEntityError,
} from "@/server/errors/index.ts";

describe("A ruleset's refusal", () => {
  test("is answered as the server's error of its kind: its status, name, cause and message", () => {
    expect(toJson(new RulesError("invalid", "No"))).toEqual(toJson(new BadRequestError("No")));
    expect(toJson(new RulesError("unprocessable", "No"))).toEqual(toJson(new UnprocessableEntityError("No")));
    expect(toJson(new RulesError("conflict", "No"))).toEqual(toJson(new ConflictError("No")));
    expect(toJson(new RulesError("not-found", "No"))).toEqual(toJson(new NotFoundError("No")));
  });

  test("that's invalid carries what the character fails, as a bad request's issues", () => {
    const issues = [{ category: "requirements" as const, message: "Requires Power Attack" }];
    expect(toJson(new RulesError("invalid", "No", issues))).toEqual(toJson(new BadRequestError("No", { issues })));
    expect(toJson(new RulesError("invalid", "No", issues))[0].issues).toEqual(issues);
  });
});
