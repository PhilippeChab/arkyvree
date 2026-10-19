import { MAX_API_KEY_NAME_LENGTH } from "@/shared/apiKeys.ts";
import { PASSWORD_MIN_LENGTH, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from "@/shared/auth.ts";
import { sanitizeText } from "@/shared/text.ts";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** React Hook Form rules for an API key's name: required, and within the bound the API holds it to. */
export const API_KEY_NAME_RULES = {
  required: "Name is required",
  maxLength: { value: MAX_API_KEY_NAME_LENGTH, message: `Name must be at most ${MAX_API_KEY_NAME_LENGTH} characters` },
} as const;

/** React Hook Form rules for a new feat's or spell's aptitudes: at least one, as the API asks. */
export const APTITUDES_RULES = { required: "At least one aptitude must be selected" } as const;

/** React Hook Form rules for a decimal written as text (an item's cost, its weight): digits with one point, or nothing. */
export const DECIMAL_RULES = { pattern: { value: /^(\d+\.?\d*|\.\d+)?$/, message: "Must be a number" } } as const;

/** React Hook Form rules for a required email address field. */
export const EMAIL_RULES = {
  required: "Email address is required",
  pattern: { value: EMAIL_PATTERN, message: "Enter a valid email address" },
} as const;

/** React Hook Form rules for an entity's required name. */
export const NAME_RULES = { required: "Name is required" } as const;

/** React Hook Form rules for the user's password, as a sign-in or a confirmation asks it. */
export const PASSWORD_RULES = { required: "Password is required" } as const;

/** React Hook Form rules for a password the user is choosing, measured as it's stored (`sanitizeText`). */
export const NEW_PASSWORD_RULES = {
  ...PASSWORD_RULES,
  validate: (value: unknown) =>
    sanitizeText(String(value)).length >= PASSWORD_MIN_LENGTH ||
    `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
} as const;

/** React Hook Form rules for an email address that may be left empty (an invite's, sent only when given). */
export const OPTIONAL_EMAIL_RULES = { pattern: EMAIL_RULES.pattern } as const;

/**
 * React Hook Form rules for an optional username, measured as it's stored (`sanitizeText`): `USERNAME_MIN_LENGTH` to
 * `USERNAME_MAX_LENGTH` characters.
 */
export const USERNAME_RULES = {
  validate: (value: unknown) => {
    if (value === "" || value == null) return true;
    const length = sanitizeText(String(value)).length;
    if (length < USERNAME_MIN_LENGTH) return `Username must be at least ${USERNAME_MIN_LENGTH} characters`;
    return length <= USERNAME_MAX_LENGTH || `Username must be at most ${USERNAME_MAX_LENGTH} characters`;
  },
} as const;

/** React Hook Form rules for a field that must repeat `passwordField`. */
export function confirmPasswordRules<T extends object>(passwordField: keyof T) {
  return {
    required: "Password confirmation is required",
    validate: (value: unknown, formValues: T) => value === formValues[passwordField] || "Passwords do not match",
  };
}

/**
 * What a number input outside a form's own fields (a list's) holds: its number, which its rule checks, or undefined
 * while it's empty.
 */
export function readNumberInput(text: string) {
  return text === "" ? undefined : Number(text);
}

/** React Hook Form rules for a field that must be filled, saying so in `message` ("Level is required"). */
export function requiredRules(message: string) {
  return { required: message };
}

/**
 * What's wrong with a whole number from `min` to `max` (no bound above when it's left out), in `wholeNumberRules`' words:
 * an input outside a form's own fields (a list's) shows it, its field's `validate` checking the list.
 */
export function wholeNumberError(value: number, min: number, max?: number) {
  if (!Number.isInteger(value)) return "Whole numbers only";
  if (value < min) return `Minimum ${min}`;
  if (max !== undefined && value > max) return `Maximum ${max}`;
  return undefined;
}

/**
 * React Hook Form rules for a whole number of at least `min` (any, without one), for a number field
 * (`<FormTextField number />`). Use these rather than native `min`: the browser's own check would block the submit
 * before the field shows why. An emptied number field holds NaN, which a request sends as null: `required` says why it
 * can't be empty, or is `false` for one its save sends empty on purpose (a cleared age). A whole number then passes
 * its field's own `checks`, in order, the first that fails saying why (a progression's level, listed once).
 */
export function wholeNumberRules(
  min: number | undefined,
  required: string | false,
  max?: number,
  checks: readonly ((value: number) => string | true)[] = [],
) {
  return {
    required: required || undefined,
    ...(min !== undefined && { min: { value: min, message: `Minimum ${min}` } }),
    ...(max !== undefined && { max: { value: max, message: `Maximum ${max}` } }),
    validate: (value: unknown) => {
      if (typeof value !== "number" || Number.isNaN(value)) return true;
      if (!Number.isInteger(value)) return "Whole numbers only";
      return checks.map((check) => check(value)).find((result) => result !== true) ?? true;
    },
  };
}
