import { PASSWORD_MIN_LENGTH } from "@/shared/auth.ts";

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
