import { useEffect } from "react";

import { APP_NAME } from "@/client/src/lib/brand.ts";

/** The browser tab's title: the page's, then the app's name, or the app's name alone. */
export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} | ${APP_NAME}` : APP_NAME;
    return () => {
      document.title = APP_NAME;
    };
  }, [title]);
}
