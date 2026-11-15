import nodemailer, { type Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import { Resend } from "resend";

import { readEmailDelivery, readSmtpHost, SMTP_TLS_MODES } from "@/server/emails/index.ts";
import { isProduction, isTest, readEnv } from "@/server/environment.ts";

/** What each way of reaching an SMTP server (`SMTP_TLS`) sets: TLS from the start, upgraded with STARTTLS, or never. */
const SMTP_TLS_OPTIONS = {
  implicit: { secure: true },
  starttls: { secure: false, requireTLS: true },
  none: { secure: false, ignoreTLS: true },
} satisfies Record<(typeof SMTP_TLS_MODES)[number], SMTPTransport.Options>;

/**
 * How the SMTP server is reached: as `SMTP_TLS` says, else TLS from the start on port 465, STARTTLS required in
 * production, and STARTTLS when the server offers it elsewhere (development's Mailpit doesn't need it).
 */
function readSmtpTls(port: number): SMTPTransport.Options {
  const tls = readEnv("SMTP_TLS");
  const mode = SMTP_TLS_MODES.find((known) => known === tls);
  if (mode) return SMTP_TLS_OPTIONS[mode];
  if (tls) throw new Error(`SMTP_TLS is ${tls}: it's ${SMTP_TLS_MODES.join(", ")}`);
  if (port === 465) return SMTP_TLS_OPTIONS.implicit;
  return isProduction() ? SMTP_TLS_OPTIONS.starttls : { secure: false };
}

/**
 * How this process sends email (`readEmailDelivery`): Resend's API or an SMTP server; neither in the tests, where
 * nothing leaves, nor in development without Mailpit. Either is null when it isn't the one, and the email task says
 * so: in production, by failing, so the job is retried and reported (production doesn't start without either).
 */
export function createEmailTransports(): { resend: Resend | null; smtpTransport: Transporter | null } {
  const delivery = readEmailDelivery();
  const host = readSmtpHost();
  if (isTest()) return { resend: null, smtpTransport: null };
  if (delivery === "resend") return { resend: new Resend(readEnv("RESEND_API_KEY")), smtpTransport: null };
  if (delivery === "smtp" && host)
    return { resend: null, smtpTransport: nodemailer.createTransport(readSmtpOptions(host)) };
  return { resend: null, smtpTransport: null };
}

/**
 * What reaches the SMTP server (`host`): its port (587 in production unless set, development's Mailpit's 1025
 * elsewhere), its TLS (`readSmtpTls`), and its user and password when one is set.
 */
export function readSmtpOptions(host: string): SMTPTransport.Options {
  const port = Number(readEnv("SMTP_PORT")) || (isProduction() ? 587 : 1025);
  const user = readEnv("SMTP_USERNAME");
  return {
    host,
    port,
    ...readSmtpTls(port),
    ...(user ? { auth: { user, pass: readEnv("SMTP_PASSWORD") ?? "" } } : {}),
  };
}
