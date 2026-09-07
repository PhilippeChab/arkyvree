import { CampaignInvitationEmail } from "@/emails/campaign-invitation.tsx";
import { CharacterContributorInvitationEmail } from "@/emails/character-contributor-invitation.tsx";
import { ContributorInvitationEmail } from "@/emails/contributor-invitation.tsx";
import { EmailChangeVerificationEmail } from "@/emails/email-change-verification.tsx";
import { EmailVerificationEmail } from "@/emails/email-verification.tsx";
import { PasswordResetEmail } from "@/emails/password-reset.tsx";
import { WelcomeEmail } from "@/emails/welcome.tsx";

export const TEMPLATES = {
  campaignInvitation: CampaignInvitationEmail,
  characterContributorInvitation: CharacterContributorInvitationEmail,
  contributorInvitation: ContributorInvitationEmail,
  emailChangeVerification: EmailChangeVerificationEmail,
  emailVerification: EmailVerificationEmail,
  passwordReset: PasswordResetEmail,
  welcome: WelcomeEmail,
} as const;

export type TemplateName = keyof typeof TEMPLATES;
export type PropsFor<K extends TemplateName> = Parameters<(typeof TEMPLATES)[K]>[0];

export type EmailJobPayload = {
  [K in TemplateName]: { template: K; props: PropsFor<K> };
}[TemplateName];

export const EmailTemplate = {
  CampaignInvitation: "campaignInvitation",
  CharacterContributorInvitation: "characterContributorInvitation",
  ContributorInvitation: "contributorInvitation",
  EmailChangeVerification: "emailChangeVerification",
  EmailVerification: "emailVerification",
  PasswordReset: "passwordReset",
  Welcome: "welcome",
} as const satisfies Record<string, TemplateName>;
