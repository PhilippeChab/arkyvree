/** Google Identity Services, the script `useGoogleSignIn` loads: what of it the hook calls. */

interface GoogleAccountsId {
  initialize: (config: GoogleIdConfiguration) => void;
  renderButton: (parent: HTMLElement, config: GoogleButtonConfiguration) => void;
}

interface GoogleButtonConfiguration {
  size?: "large" | "medium" | "small";
  type?: "standard" | "icon";
  width?: number;
}

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleIdConfiguration {
  callback: (response: GoogleCredentialResponse) => void;
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
