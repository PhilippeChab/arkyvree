interface GoogleAccountsId {
  disableAutoSelect: () => void;
  initialize: (config: GoogleIdConfiguration) => void;
  prompt: () => void;
  renderButton: (parent: HTMLElement, config: GoogleButtonConfiguration) => void;
}

interface GoogleButtonConfiguration {
  locale?: string;
  logo_alignment?: "left" | "center";
  shape?: "rectangular" | "pill" | "circle" | "square";
  size?: "large" | "medium" | "small";
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  theme?: "outline" | "filled_blue" | "filled_black";
  type?: "standard" | "icon";
  width?: number;
}

interface GoogleCredentialResponse {
  credential: string;
  select_by: string;
}

interface GoogleIdConfiguration {
  auto_select?: boolean;
  callback: (response: GoogleCredentialResponse) => void;
  cancel_on_tap_outside?: boolean;
  client_id: string;
}

interface Window {
  __APP_CONFIG__?: {
    googleClientId: string | null;
    sentryDsn?: string | null;
    sentryEnvironment?: string | null;
    sentryRelease?: string | null;
  };
  google?: {
    accounts: {
      id: GoogleAccountsId;
    };
  };
}
