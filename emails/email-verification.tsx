import { Heading, Section, Text } from "@react-email/components";

import { EmailLayout, styles } from "./EmailLayout.tsx";

interface EmailVerificationProps {
  code?: string;
}

export const EmailVerificationEmail = ({
  code = "000000",
}: EmailVerificationProps) => (
  <EmailLayout preview={`Your verification code is ${code}`}>
    <Heading style={styles.heading}>Verify Your Email</Heading>
    <Text style={styles.text}>
      Enter this code to verify your email address and complete your
      registration:
    </Text>
    <Section style={styles.codeContainer}>
      <Text style={styles.code}>{code}</Text>
    </Section>
    <Text style={styles.muted}>This code expires in 15 minutes.</Text>
    <Text style={styles.muted}>
      If you didn't create an account, you can safely ignore this email.
    </Text>
  </EmailLayout>
);

export default EmailVerificationEmail;
