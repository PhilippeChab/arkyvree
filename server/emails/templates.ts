import { toPlainText } from "@react-email/render";
import { renderToStaticMarkup } from "react-dom/server";

import { CampaignInvitationEmail } from "@/emails/campaign-invitation.tsx";
import { CharacterContributorInvitationEmail } from "@/emails/character-contributor-invitation.tsx";
import { ContributorInvitationEmail } from "@/emails/contributor-invitation.tsx";
import { EmailChangeVerificationEmail } from "@/emails/email-change-verification.tsx";
import { EmailVerificationEmail } from "@/emails/email-verification.tsx";
import { PasswordResetEmail } from "@/emails/password-reset.tsx";
import { WelcomeEmail } from "@/emails/welcome.tsx";

type PropsFor<K extends TemplateName> = Parameters<(typeof TEMPLATES)[K]>[0];

export type EmailJobPayload = {
  [K in TemplateName]: { template: K; props: PropsFor<K> };
}[TemplateName];

export type TemplateName = keyof typeof TEMPLATES;

const TEMPLATES = {
  campaignInvitation: CampaignInvitationEmail,
  characterContributorInvitation: CharacterContributorInvitationEmail,
  contributorInvitation: ContributorInvitationEmail,
  emailChangeVerification: EmailChangeVerificationEmail,
  emailVerification: EmailVerificationEmail,
  passwordReset: PasswordResetEmail,
  welcome: WelcomeEmail,
} as const;

const XHTML_DOCTYPE =
  '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">';

export const EmailTemplate = {
  CampaignInvitation: "campaignInvitation",
  CharacterContributorInvitation: "characterContributorInvitation",
  ContributorInvitation: "contributorInvitation",
  EmailChangeVerification: "emailChangeVerification",
  EmailVerification: "emailVerification",
  PasswordReset: "passwordReset",
  Welcome: "welcome",
} as const satisfies Record<string, TemplateName>;

/** An email's HTML and its plain-text version, from its template and props. */
export function renderEmail({ template, props }: EmailJobPayload) {
  const Component = TEMPLATES[template] as ((p: unknown) => React.JSX.Element) | undefined;
  if (!Component) throw new Error(`Unknown email template: ${template}`);
  const html = `${XHTML_DOCTYPE}${renderToStaticMarkup(Component(props))}`;
  return { html, text: toPlainText(html) };
}
