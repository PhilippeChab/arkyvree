import { toPlainText } from "@react-email/render";
import type { Task } from "graphile-worker";
import nodemailer from "nodemailer";
import { renderToStaticMarkup } from "react-dom/server";
import { Resend } from "resend";

import { TEMPLATES, type EmailJobPayload, type TemplateName } from "@/server/emails/templates.ts";

type SendEmailPayload = {
  to: string[];
  from: string;
  subject: string;
} & EmailJobPayload;

const XHTML_DOCTYPE =
  '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">';

const env = process.env.NODE_ENV;
const isProduction = env === "production";

let resend: Resend | null = null;
let smtpTransport: nodemailer.Transporter | null = null;

if (isProduction) {
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) resend = new Resend(apiKey);
} else if (env !== "test") {
  const smtpHost = process.env.SMTP_HOST;
  if (smtpHost) {
    smtpTransport = nodemailer.createTransport({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT) || 1025,
      secure: false,
    });
  } else {
    console.warn("[email] SMTP_HOST not set — emails will not be sent. Run `bun dev:mail` to start Mailpit.");
  }
}

export const sendEmailTask: Task = async (payload, helpers) => {
  const { to, from, subject, template, props } = payload as SendEmailPayload;

  if (!smtpTransport && !resend) {
    if (isProduction) {
      throw new Error("Email service not configured");
    }
    helpers.logger.warn(`Email service not configured — skipping send to ${to.join(", ")}`);
    return;
  }

  const Component = TEMPLATES[template as TemplateName] as (p: unknown) => React.JSX.Element;
  if (!Component) {
    throw new Error(`Unknown email template: ${template}`);
  }
  const html = `${XHTML_DOCTYPE}${renderToStaticMarkup(Component(props))}`;
  const text = toPlainText(html);

  if (smtpTransport) {
    await smtpTransport.sendMail({
      from,
      to: to.join(", "),
      subject,
      html,
      text,
    });
    helpers.logger.info(`Email sent via SMTP to ${to.join(", ")}: ${subject}`);
    return;
  }

  const result = await resend!.emails.send({ from, to, subject, html, text });
  if (result.error) {
    throw new Error(result.error.message);
  }
  helpers.logger.info(`Email sent via Resend to ${to.join(", ")}: ${subject}`);
};
