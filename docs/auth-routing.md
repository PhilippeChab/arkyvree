# Auth & Routing

How the client routes between unauthenticated, public, and authenticated surfaces.

## Three-bucket routing

`client/src/App.tsx` declares a static route tree (`router`, `createBrowserRouter`) with three sibling layout-routes. No `isAuthenticated` ternary inside the routing config — each layout owns its own guard.

| Wrapper | File | Renders for | Guard behavior |
|---|---|---|---|
| `AuthLayoutRoute` | `client/src/components/auth/AuthLayoutRoute.tsx` | Unauth users on auth-flow pages | Signed-in user → `/dashboard`. Unauth → form. |
| `PublicLayout` | `client/src/components/layout/PublicLayout.tsx` | Anyone | None. Toolbar swaps "Sign Up" ↔ "Dashboard" by auth state. |
| `PrivateRoute` | `client/src/components/auth/PrivateRoute.tsx` | Authenticated users | Authed → `<Outlet/>`, while the session probe confirms the remembered user (another user's session replaces them, and their admin standing follows the server's; a 401 signs out). No remembered user: while the probe runs → `PageLoader`. Unauth → `/sign-in?redirect=<path>` (`authPagePath`; no redirect when the user signed out of the page). |

The admin page (`/admin`, `AdminPage`) is a private page its admins alone see in the sidebar (`isAdmin`, which the store keeps with the user); anyone else who opens it goes to `/dashboard`, and its routes refuse them (`InstancePolicy`, [access.md](./access.md#the-instance--instancepolicy)). The sign-up and sign-in pages read who may sign up (`GET /auth/sign-up-policy`): an instance closed to new accounts shows its sign-up page's form as a message instead, and its sign-in page offers no sign-up; one that takes invites alone says so above the form, or, opened through an invite link (`/sign-up?invite=<token>`), says whether the link lets the visitor in (`POST /auth/invite-links/state`). The page keeps the token for the tab and takes it out of the address bar (`useInviteToken`), and sends it with the sign-up and with a Google sign-in from the sign-up or sign-in page.

An admin's password reset link opens `/reset-password-link?token=<token>` (`PasswordResetLinkPage`, an auth page): it reads the token once and takes it out of the address bar (`useResetToken`), says up front whether the link resets a password (`POST /auth/password-reset-links/state`), then takes the new password and sends its user to sign in ([access.md](./access.md#the-instance--instancepolicy)). The forgot-password page says an admin can make one.

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
