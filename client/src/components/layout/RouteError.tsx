import { useRouteError } from "react-router-dom";

/** A page's error, thrown on to the app's `ErrorBoundary`, which the router would otherwise answer with its own. */
export function RouteError(): never {
  throw useRouteError();
}
