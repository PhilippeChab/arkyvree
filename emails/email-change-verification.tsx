import { Heading, Section, Text } from "@react-email/components";

import { EmailLayout } from "./EmailLayout.tsx";
import { styles } from "./emailStyles.ts";

interface EmailChangeVerificationProps {
  code?: string;
}

export function EmailChangeVerificationEmail({ code = "000000" }: EmailChangeVerificationProps) {
  return (
    <EmailLayout preview={`Your email change verification code is ${code}`}>
      <Heading style={styles.heading}>Confirm Your New Email</Heading>
      <Text style={styles.text}>You requested to change your email address. Enter this code to confirm:</Text>
      <Section style={styles.codeContainer}>
        <Text style={styles.code}>{code}</Text>
      </Section>
      <Text style={styles.muted}>This code expires in 15 minutes.</Text>
      <Text style={styles.muted}>If you didn't request this, you can safely ignore this email.</Text>
    </EmailLayout>
  );
}

export default EmailChangeVerificationEmail;
