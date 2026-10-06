import { PASSWORD_MIN_LENGTH } from "@/shared/auth.ts";
import { sanitizeText } from "@/shared/text.ts";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** React Hook Form rules for an entity's required name. */
export const nameRules = { required: "Name is required" } as const;

/** React Hook Form rules for a required email address field. */
export const emailRules = {
  required: "Email is required",
  pattern: { value: EMAIL_PATTERN, message: "Please enter a valid email address" },
} as const;

/** React Hook Form rules for a password the user is choosing, measured as it's stored (`sanitizeText`). */
export const newPasswordRules = {
  required: "Password is required",
  validate: (value: unknown) =>
    sanitizeText(String(value)).length >= PASSWORD_MIN_LENGTH ||
    `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
} as const;

/** React Hook Form rules for an optional username, measured as it's stored (`sanitizeText`): 3 to 50 characters. */
export const usernameRules = {
  validate: (value: unknown) => {
    if (value === "" || value == null) return true;
    const length = sanitizeText(String(value)).length;
    if (length < 3) return "Username must be at least 3 characters";
    return length <= 50 || "Username must be at most 50 characters";
  },
} as const;

/** React Hook Form rules for a field that must repeat `passwordField`. */
export function confirmPasswordRules<T extends object>(passwordField: keyof T) {
  return {
    required: "Please confirm your password",
    validate: (value: unknown, formValues: T) => value === formValues[passwordField] || "Passwords do not match",
  };
}

/**
 * React Hook Form rules for a whole number of at least `min`, for a number field (`<FormTextField number />`). Use these
 * rather than native `min`: the browser's own check would block the submit before the field shows why.
 */
export function wholeNumberRules(min: number, required?: string) {
  return {
    required,
    min: { value: min, message: `Minimum ${min}` },
    validate: (value: unknown) =>
      typeof value !== "number" || Number.isNaN(value) || Number.isInteger(value) || "Whole numbers only",
  };
}
