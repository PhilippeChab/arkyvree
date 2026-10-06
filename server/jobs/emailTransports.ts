import nodemailer, { type Transporter } from "nodemailer";
import { Resend } from "resend";

import { isProduction, isTest, readEnv } from "@/server/environment.ts";

/**
 * How this process sends email: Resend in production (with its API key), a local SMTP server elsewhere (Mailpit, at
 * `SMTP_HOST`), nothing in tests. Either is null when it isn't configured, and the email task says so.
 */
export function createEmailTransports(): { resend: Resend | null; smtpTransport: Transporter | null } {
  if (isProduction()) {
    const apiKey = readEnv("RESEND_API_KEY");
    return { resend: apiKey ? new Resend(apiKey) : null, smtpTransport: null };
  }
  if (isTest()) return { resend: null, smtpTransport: null };
  const smtpHost = readEnv("SMTP_HOST");
  if (!smtpHost) {
    console.warn("[email] SMTP_HOST not set — emails will not be sent. Run `bun dev:mail` to start Mailpit.");
    return { resend: null, smtpTransport: null };
  }
  const smtpTransport = nodemailer.createTransport({
    host: smtpHost,
    port: Number(readEnv("SMTP_PORT")) || 1025,
    secure: false,
  });
  return { resend: null, smtpTransport };
}
