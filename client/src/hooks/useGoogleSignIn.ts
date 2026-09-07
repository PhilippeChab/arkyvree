import { useEffect, useRef, useState } from "react";

const GSI_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const CLIENT_ID = window.__APP_CONFIG__?.googleClientId || null;

let scriptLoadPromise: Promise<void> | null = null;
let initialized = false;
let globalCallback: ((response: GoogleCredentialResponse) => void) | null = null;

function loadGsiScript(): Promise<void> {
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = GSI_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoadPromise = null;
      reject(new Error("Failed to load Google Sign-In"));
    };
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

export function useGoogleSignIn(onToken: (idToken: string) => void) {
  const [isAvailable, setIsAvailable] = useState(false);
  const callbackRef = useRef(onToken);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  callbackRef.current = onToken;

  useEffect(() => {
    let cancelled = false;

    if (!CLIENT_ID) return;

    loadGsiScript()
      .then(() => {
        if (cancelled) return;

        globalCallback = (response: GoogleCredentialResponse) => {
          callbackRef.current(response.credential);
        };

        if (!initialized) {
          window.google?.accounts.id.initialize({
            client_id: CLIENT_ID,
            callback: (response: GoogleCredentialResponse) => {
              globalCallback?.(response);
            },
          });
          initialized = true;
        }

        setIsAvailable(true);
      })
      .catch(() => {
        if (!cancelled) setIsAvailable(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isAvailable && overlayRef.current) {
      const container = overlayRef.current;
      window.google?.accounts.id.renderButton(container, {
        type: "standard",
        size: "large",
        width: Math.min(container.offsetWidth, 400),
      });
    }
  }, [isAvailable]);

  return { overlayRef, isAvailable };
}
