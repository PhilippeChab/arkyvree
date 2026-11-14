# Auth & Routing

How the client routes between unauthenticated, public, and authenticated surfaces.

## Three-bucket routing

`client/src/App.tsx` declares a static route tree (`router`, `createBrowserRouter`) with three sibling layout-routes. No `isAuthenticated` ternary inside the routing config — each layout owns its own guard.

| Wrapper | File | Renders for | Guard behavior |
|---|---|---|---|
| `AuthLayoutRoute` | `client/src/components/auth/AuthLayoutRoute.tsx` | Unauth users on auth-flow pages | Signed-in user → `/dashboard`. Unauth → form. |
| `PublicLayout` | `client/src/components/layout/PublicLayout.tsx` | Anyone | None. Toolbar swaps "Sign Up" ↔ "Dashboard" by auth state. |
| `PrivateRoute` | `client/src/components/auth/PrivateRoute.tsx` | Authenticated users | Authed → `<Outlet/>`, while the session probe confirms the remembered user (another user's session replaces them; a 401 signs out). No remembered user: while the probe runs → `PageLoader`. Unauth → `/sign-in?redirect=<path>` (`authPagePath`; no redirect when the user signed out of the page). |

## Cookie security

`server/middlewares/session.ts`:

- `httpOnly: true` — JS can't read the cookie (XSS-resistant).
- `secure: true` in production — TLS-only.
- `sameSite: "Strict"` — strongest CSRF protection.
- `path: "/"`, 7-day `maxAge`.
- Opaque UUID session ID (not a JWT). Server-side `sessions` table — instantly revocable.

Password recovery revokes every existing session in the same transaction as the password update. An authenticated password change revokes other sessions while preserving the current session. Invalid reset codes and failed password changes do not revoke sessions.

## Cross-tab behavior

The cookie is shared across tabs in the same origin. State is server-authoritative; local Zustand stores can desync transiently.

| Scenario | Behavior |
|---|---|
| Tab A (real session), Tab B opens `/sign-in` | Tab B redirects to `/dashboard`. Tab A untouched. |
| Tab A (real session), Tab B signs out | Tab B clears session. Tab A's next API call → 401 → `/sign-in`. |

There's no `BroadcastChannel`-based active sync today. Recovery happens lazily via the next 401 in the stale tab.
