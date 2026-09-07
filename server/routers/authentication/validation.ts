import { z } from "zod";

import { sanitizeEmail, sanitizeText } from "@/shared/utils.ts";

export const SignUpJson = z
  .object({
    emailAddress: z.string().email(),
    password: z.string().min(12),
    passwordConfirmation: z.string().min(12),
  })
  .transform((input) => {
    return {
      emailAddress: sanitizeEmail(input.emailAddress),
      password: sanitizeText(input.password),
      passwordConfirmation: sanitizeText(input.passwordConfirmation),
    };
  });

export const SignInJson = z
  .object({
    emailAddress: z.string().email(),
    password: z.string(),
  })
  .transform((input) => {
    return {
      emailAddress: sanitizeEmail(input.emailAddress),
      password: sanitizeText(input.password),
    };
  });

export const UpdateProfileJson = z
  .object({
    username: z.string().min(3).max(50).optional(),
    emailAddress: z.string().email().optional(),
  })
  .transform((input) => {
    return {
      username: input.username ? sanitizeText(input.username) : undefined,
      emailAddress: input.emailAddress ? sanitizeEmail(input.emailAddress) : undefined,
    };
  });

export const UpdatePasswordJson = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(12),
    newPasswordConfirmation: z.string().min(12),
  })
  .transform((input) => {
    return {
      currentPassword: sanitizeText(input.currentPassword),
      newPassword: sanitizeText(input.newPassword),
      newPasswordConfirmation: sanitizeText(input.newPasswordConfirmation),
    };
  })
  .refine((data) => data.newPassword === data.newPasswordConfirmation, {
    message: "Passwords do not match",
    path: ["newPasswordConfirmation"],
  });

export const VerifyEmailJson = z
  .object({
    emailAddress: z.string().email(),
    code: z.string(),
  })
  .transform((input) => {
    return {
      emailAddress: sanitizeEmail(input.emailAddress),
      code: sanitizeText(input.code),
    };
  });

export const ResendVerificationJson = z
  .object({
    emailAddress: z.string().email(),
  })
  .transform((input) => {
    return {
      emailAddress: sanitizeEmail(input.emailAddress),
    };
  });

export const ForgotPasswordJson = z
  .object({
    emailAddress: z.string().email(),
  })
  .transform((input) => {
    return {
      emailAddress: sanitizeEmail(input.emailAddress),
    };
  });

export const ResetPasswordJson = z
  .object({
    emailAddress: z.string().email(),
    code: z.string(),
    newPassword: z.string().min(12),
    newPasswordConfirmation: z.string().min(12),
  })
  .transform((input) => {
    return {
      emailAddress: sanitizeEmail(input.emailAddress),
      code: sanitizeText(input.code),
      newPassword: sanitizeText(input.newPassword),
      newPasswordConfirmation: sanitizeText(input.newPasswordConfirmation),
    };
  })
  .refine((data) => data.newPassword === data.newPasswordConfirmation, {
    message: "Passwords do not match",
    path: ["newPasswordConfirmation"],
  });

export type SignUpJson = z.infer<typeof SignUpJson>;
export type SignInJson = z.infer<typeof SignInJson>;
export type UpdateProfileJson = z.infer<typeof UpdateProfileJson>;
export type UpdatePasswordJson = z.infer<typeof UpdatePasswordJson>;
export type VerifyEmailJson = z.infer<typeof VerifyEmailJson>;
export type ResendVerificationJson = z.infer<typeof ResendVerificationJson>;
export type ForgotPasswordJson = z.infer<typeof ForgotPasswordJson>;
export const VerifyEmailChangeJson = z
  .object({
    code: z.string(),
  })
  .transform((input) => {
    return {
      code: sanitizeText(input.code),
    };
  });

export const DeleteAccountJson = z
  .object({
    password: z.string().min(1).optional(),
  })
  .transform((input) => {
    return {
      password: input.password ? sanitizeText(input.password) : undefined,
    };
  });

export const GoogleSignInJson = z
  .object({
    idToken: z.string().min(1),
  })
  .transform((input) => {
    return {
      idToken: input.idToken,
    };
  });

export const SetPasswordJson = z
  .object({
    newPassword: z.string().min(12),
    newPasswordConfirmation: z.string().min(12),
  })
  .transform((input) => {
    return {
      newPassword: sanitizeText(input.newPassword),
      newPasswordConfirmation: sanitizeText(input.newPasswordConfirmation),
    };
  })
  .refine((data) => data.newPassword === data.newPasswordConfirmation, {
    message: "Passwords do not match",
    path: ["newPasswordConfirmation"],
  });

export const UnlinkOauthJson = z
  .object({
    provider: z.string().min(1),
  })
  .transform((input) => {
    return {
      provider: sanitizeText(input.provider),
    };
  });

export type ResetPasswordJson = z.infer<typeof ResetPasswordJson>;
export type VerifyEmailChangeJson = z.infer<typeof VerifyEmailChangeJson>;
export type DeleteAccountJson = z.infer<typeof DeleteAccountJson>;
export type GoogleSignInJson = z.infer<typeof GoogleSignInJson>;
export type SetPasswordJson = z.infer<typeof SetPasswordJson>;
export type UnlinkOauthJson = z.infer<typeof UnlinkOauthJson>;
