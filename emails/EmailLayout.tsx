import { Body, Container, Head, Hr, Html, Img, Preview, Section, Text } from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";

import { APP_URL, colors, fontStack } from "./emailStyles.ts";

interface EmailLayoutProps {
  preview: string;
  children: ReactNode;
}

const accentBar: CSSProperties = {
  border: "none",
  borderTop: `3px solid ${colors.primary}`,
  margin: "24px 0 0",
};

const body: CSSProperties = {
  backgroundColor: colors.parchment,
  fontFamily: fontStack,
  margin: 0,
  padding: "32px 16px",
};

const container: CSSProperties = {
  backgroundColor: colors.paper,
  margin: "0 auto",
  maxWidth: "580px",
  borderRadius: "8px",
  overflow: "hidden",
  boxShadow: "0 1px 3px rgba(62, 39, 35, 0.12)",
};

const divider: CSSProperties = {
  border: "none",
  borderTop: `1px solid ${colors.divider}`,
  margin: "24px 48px 0",
};

const footer: CSSProperties = {
  color: colors.textMuted,
  fontFamily: fontStack,
  fontSize: "13px",
  lineHeight: "20px",
  textAlign: "center",
  padding: "16px 48px 36px",
  margin: 0,
};

const header: CSSProperties = {
  textAlign: "center",
  padding: "36px 48px 0",
};

const logo: CSSProperties = {
  margin: "0 auto",
  display: "block",
};

const wordmark: CSSProperties = {
  color: colors.primary,
  fontFamily: fontStack,
  fontSize: "26px",
  fontWeight: 600,
  letterSpacing: "0.02em",
  margin: "12px 0 0",
  textAlign: "center",
};

export function EmailLayout({ preview, children }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <Img src={`${APP_URL}/pwa-192x192.png`} width={64} height={64} alt="Arkyvree" style={logo} />
            <Text style={wordmark}>Arkyvree</Text>
          </Section>
          <Hr style={accentBar} />
          {children}
          <Hr style={divider} />
          <Text style={footer}>© {new Date().getFullYear()} Arkyvree · Happy adventuring</Text>
        </Container>
      </Body>
    </Html>
  );
}
