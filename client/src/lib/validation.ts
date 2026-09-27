import { PASSWORD_MIN_LENGTH } from "@/shared/auth.ts";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** React Hook Form rules for an entity's required name. */
export const nameRules = { required: "Name is required" } as const;

/** React Hook Form rules for a required email address field. */
export const emailRules = {
  required: "Email is required",
  pattern: { value: EMAIL_PATTERN, message: "Please enter a valid email address" },
} as const;

/** React Hook Form rules for a password the user is choosing. */
export const newPasswordRules = {
  required: "Password is required",
  minLength: {
    value: PASSWORD_MIN_LENGTH,
    message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
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
 * React Hook Form rules for a whole number of at least `min`, registered with `valueAsNumber`. Use these rather
 * than native `min`: the browser's own check would block the submit before the field shows why.
 */
export function wholeNumberRules(min: number, required?: string) {
  return {
    valueAsNumber: true as const,
    required,
    min: { value: min, message: `Minimum ${min}` },
    validate: (value: number) => Number.isNaN(value) || Number.isInteger(value) || "Whole numbers only",
  };
}
