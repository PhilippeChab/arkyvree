interface GoogleIdConfiguration {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
}

interface GoogleCredentialResponse {
  credential: string;
  select_by: string;
}

interface GoogleButtonConfiguration {
  type?: "standard" | "icon";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape?: "rectangular" | "pill" | "circle" | "square";
  logo_alignment?: "left" | "center";
  width?: number;
  locale?: string;
}

interface GoogleAccountsId {
  initialize: (config: GoogleIdConfiguration) => void;
  renderButton: (parent: HTMLElement, config: GoogleButtonConfiguration) => void;
  prompt: () => void;
  disableAutoSelect: () => void;
}

interface Window {
  __APP_CONFIG__?: {
    googleClientId: string | null;
    sentryDsn?: string | null;
    sentryEnvironment?: string | null;
    sentryRelease?: string | null;
    featurebaseEnabled?: boolean;
  };
  google?: {
    accounts: {
      id: GoogleAccountsId;
    };
  };
}
