/** Google Identity Services, the script `useGoogleSignIn` loads: what of it the hook calls. */

interface GoogleAccountsId {
  initialize: (config: GoogleIdConfiguration) => void;
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
  /** Set once the script has loaded. */
  google?: {
    accounts: {
      id: GoogleAccountsId;
    };
  };
}
