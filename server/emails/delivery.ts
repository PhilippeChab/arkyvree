import { isProduction, readEnv } from "@/server/environment.ts";

/** Resend's API (`RESEND_API_KEY`, in production), an SMTP server (`SMTP_ADDRESS` or `SMTP_HOST`), or none yet. */
export type EmailDelivery = "none" | "resend" | "smtp";

/** Who email comes from unless `MAILER_FROM_ADDRESS` says otherwise. */
const DEFAULT_SENDER = "Arkyvree <notifications@arkyvree.com>";

/** What a production start without a way to send email says: both ways, and what each reads. */
export const NO_EMAIL_MESSAGE =
  "No way to send email: set RESEND_API_KEY to send through Resend, or SMTP_ADDRESS or SMTP_HOST (with SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD and SMTP_TLS as the server needs) to send through an SMTP server.";

/** The ways an SMTP server is reached (`SMTP_TLS`): TLS from the start, upgraded with STARTTLS, or never. */
export const SMTP_TLS_MODES = ["implicit", "starttls", "none"] as const;

/**
 * Checks, as a process starts (`processName`: the server or the worker), that it can send email as it's set up, and
 * stops it otherwise (`findEmailSetupProblem`); then says how it sends it, and when Resend's key and an SMTP server are
 * both set, that Resend wins. Outside production, an instance with neither warns that it sends none (development
 * without Mailpit).
 */
export function checkEmailSetup(processName: "server" | "worker") {
  const problem = findEmailSetupProblem();
  if (problem) {
    console.error(`[${processName}] ${problem}`);
    process.exit(1);
  }
  const delivery = readEmailDelivery();
  if (delivery === "none") {
    console.warn(`[${processName}] SMTP_HOST not set: emails will not be sent. Run \`bun dev:mail\` to start Mailpit.`);
  } else if (delivery === "resend" && readSmtpHost()) {
    console.log(`[${processName}] RESEND_API_KEY and an SMTP server are both set: email goes through Resend.`);
  } else {
    console.log(
      `[${processName}] Email goes through ${delivery === "resend" ? "Resend" : `SMTP (${readSmtpHost()})`}.`,
    );
  }
}

/**
 * What stops a start of this instance's email (none when nothing does): in production, no way to send it at all; and,
 * wherever it runs, SMTP settings that reach no server (a port, a user or a TLS mode without its address), a user
 * without its password or a password without its user, or a TLS mode that isn't one. The server and the worker each
 * ask it as they start, and stop on its answer.
 */
export function findEmailSetupProblem(): string | undefined {
  const tls = readEnv("SMTP_TLS");
  if (tls && !(SMTP_TLS_MODES as readonly string[]).includes(tls))
    return `SMTP_TLS is ${tls}: it's ${SMTP_TLS_MODES.join(", ")}`;
  const settings = ["SMTP_PORT", "SMTP_USERNAME", "SMTP_PASSWORD", "SMTP_TLS"] as const;
  const set = settings.filter((name) => readEnv(name));
  if (set.length > 0 && !readSmtpHost())
    return `${set.join(", ")} set without SMTP_ADDRESS or SMTP_HOST: ${NO_EMAIL_MESSAGE}`;
  if (!!readEnv("SMTP_USERNAME") !== !!readEnv("SMTP_PASSWORD"))
    return "SMTP_USERNAME and SMTP_PASSWORD go together: set both, or neither for a server that takes no sign-in";
  if (isProduction() && readEmailDelivery() === "none") return NO_EMAIL_MESSAGE;
  return undefined;
}

/**
 * How this instance sends email: Resend in production when its key is set, ahead of an SMTP server set as well; an SMTP
 * server when one is set (ONCE's `SMTP_ADDRESS`, or `SMTP_HOST`, which development's Mailpit uses); none otherwise,
 * which production refuses to start with (`findEmailSetupProblem`), and development warns of.
 */
export function readEmailDelivery(): EmailDelivery {
  if (isProduction() && readEnv("RESEND_API_KEY")) return "resend";
  return readSmtpHost() ? "smtp" : "none";
}

/** Who email comes from: `MAILER_FROM_ADDRESS`, or Arkyvree's own address. */
export function readSender() {
  return readEnv("MAILER_FROM_ADDRESS") || DEFAULT_SENDER;
}

/** The SMTP server's host: ONCE's `SMTP_ADDRESS`, or `SMTP_HOST` (development's Mailpit). */
export function readSmtpHost() {
  return readEnv("SMTP_ADDRESS") || readEnv("SMTP_HOST");
}
