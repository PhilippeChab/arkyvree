import { describe, expect, test } from "bun:test";

import {
  API_KEY_NAME_RULES,
  nameRulesWithin,
  NEW_PASSWORD_RULES,
  optionalNameRulesWithin,
  USERNAME_RULES,
} from "@/client/src/lib/validation.ts";
import { characterName, sanitizedText } from "@/server/routers/api/validation.ts";
import { sanitizedPassword, sanitizedUsername } from "@/server/routers/authentication/validation.ts";
import { MAX_API_KEY_NAME_LENGTH } from "@/shared/apiKeys.ts";
import { PASSWORD_MIN_LENGTH, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from "@/shared/auth.ts";
import { MAX_CHARACTER_NAME_LENGTH } from "@/shared/characters.ts";

const MAX = MAX_CHARACTER_NAME_LENGTH;
const AT_THE_BOUND = "n".repeat(MAX);
const TOO_LONG = `Name must be at most ${MAX} characters`;

describe("nameRulesWithin", () => {
  const { validate } = nameRulesWithin(MAX);

  // A create or an edit sends its name as it's typed, which the server stores sanitized, then checks
  test.each([
    ["letters at the bound", AT_THE_BOUND, true],
    ["letters past it", `${AT_THE_BOUND}n`, TOO_LONG],
    ["emoji at the bound, each one symbol", "🐉".repeat(MAX), true],
    ["emoji past it", "🐉".repeat(MAX + 1), TOO_LONG],
    ["letters at the bound between spaces, which the server drops", `  ${AT_THE_BOUND}  `, true],
    ["letters past it between spaces", ` ${AT_THE_BOUND}n `, TOO_LONG],
    ["an accent written apart at the bound, one letter once it's stored", `${"n".repeat(MAX - 1)}e\u0301`, true],
    ["a superscript, kept as it's written", "  Kai²  ", true],
    ["nothing", "", "Name is required"],
    ["spaces alone, no name once it's stored", "   ", "Name is required"],
  ] as const)("answers %s as the server's schema does", (_, name, answer) => {
    expect(validate(name)).toBe(answer);
    expect(characterName.safeParse(name).success).toBe(answer === true);
  });
});

describe("optionalNameRulesWithin", () => {
  const rules = optionalNameRulesWithin(MAX);

  test("lets the name be left empty, which cancels a rename", () => {
    expect("required" in rules).toBe(false);
    expect(rules.validate("")).toBe(true);
    expect(rules.validate("   ")).toBe(true);
  });

  // A rename sends its name as it's typed, as a create does, which the server stores sanitized, then checks
  test.each([
    ["emoji at the bound, each one symbol", "🐉".repeat(MAX), true],
    ["emoji past it", "🐉".repeat(MAX + 1), TOO_LONG],
    ["letters at the bound and a space after them", `${AT_THE_BOUND} `, true],
    ["letters at the bound between spaces", `  ${AT_THE_BOUND}  `, true],
    ["letters past it between spaces", ` ${AT_THE_BOUND}n `, TOO_LONG],
  ] as const)("answers %s as the server's schema does the name sent", (_, name, answer) => {
    expect(rules.validate(name)).toBe(answer);
    expect(characterName.safeParse(name).success).toBe(answer === true);
  });
});

describe("API_KEY_NAME_RULES", () => {
  const tooLong = `Name must be at most ${MAX_API_KEY_NAME_LENGTH} characters`;

  test.each([
    ["letters at the bound", "k".repeat(MAX_API_KEY_NAME_LENGTH), true],
    ["letters past it", "k".repeat(MAX_API_KEY_NAME_LENGTH + 1), tooLong],
    ["emoji at the bound, each one symbol", "🔑".repeat(MAX_API_KEY_NAME_LENGTH), true],
    ["emoji past it", "🔑".repeat(MAX_API_KEY_NAME_LENGTH + 1), tooLong],
  ] as const)("answers %s as the server's schema does", (_, name, answer) => {
    expect(API_KEY_NAME_RULES.validate(name)).toBe(answer);
    expect(sanitizedText.min(1).max(MAX_API_KEY_NAME_LENGTH).safeParse(name).success).toBe(answer === true);
  });
});

describe("NEW_PASSWORD_RULES", () => {
  const tooShort = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;

  test.each([
    ["letters at the bound", "p".repeat(PASSWORD_MIN_LENGTH), true],
    ["letters short of it", "p".repeat(PASSWORD_MIN_LENGTH - 1), tooShort],
    ["emoji at the bound, each one symbol", "😀".repeat(PASSWORD_MIN_LENGTH), true],
    ["8 symbols, 4 of them emoji", "pass😀😀😀😀", tooShort],
  ] as const)("answers %s as the server's schema does", (_, password, answer) => {
    expect(NEW_PASSWORD_RULES.validate(password)).toBe(answer);
    expect(sanitizedPassword.safeParse(password).success).toBe(answer === true);
  });
});

describe("USERNAME_RULES", () => {
  const tooShort = `Username must be at least ${USERNAME_MIN_LENGTH} characters`;
  const tooLong = `Username must be at most ${USERNAME_MAX_LENGTH} characters`;

  test.each([
    ["letters at the bound", "u".repeat(USERNAME_MAX_LENGTH), true],
    ["letters past it", "u".repeat(USERNAME_MAX_LENGTH + 1), tooLong],
    ["30 emoji", "🐉".repeat(30), true],
    ["emoji at the bound, each one symbol", "🐉".repeat(USERNAME_MAX_LENGTH), true],
    ["emoji past it", "🐉".repeat(USERNAME_MAX_LENGTH + 1), tooLong],
    ["2 emoji, short of the least", "🐉🐉", tooShort],
  ] as const)("answers %s as the server's schema does", (_, username, answer) => {
    expect(USERNAME_RULES.validate(username)).toBe(answer);
    expect(sanitizedUsername.safeParse(username).success).toBe(answer === true);
  });
});
