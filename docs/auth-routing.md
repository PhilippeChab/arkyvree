# Auth & Routing

How the client routes between unauthenticated, public, and authenticated surfaces, and how the demo session interacts with auth flows.

## Three-bucket routing

`client/src/App.tsx` declares a static `<Routes>` tree with three sibling layout-routes. No `isAuthenticated` ternary inside the routing config — each layout owns its own guard.

```
AppRoutes
├── AuthLayoutRoute    ── unauth-only; kicks authed users away
│   ├── /sign-in
│   ├── /sign-up
│   ├── /verify-email
│   ├── /forgot-password
│   ├── /reset-password
│   └── /demo-expired
│
├── PublicLayout       ── anyone
│   ├── /share/:shareToken
│   └── /legal
│
└── PrivateRoute       ── auth-required; redirects unauth
    └── <Layout>
        ├── /  (index → /dashboard)
        ├── /dashboard, /rulesets, /campaigns, /characters, …
        └── *  (catch-all → /dashboard)
```

| Wrapper | File | Renders for | Guard behavior |
|---|---|---|---|
| `AuthLayoutRoute` | `client/src/components/auth/AuthLayoutRoute.tsx` | Unauth users on auth-flow pages | Demo → `signOut()` then form. Real user → `/dashboard`. Unauth → form. |
| `PublicLayout` | `client/src/components/layout/PublicLayout.tsx` | Anyone | None. Toolbar swaps "Sign Up" ↔ "Dashboard" by auth state. |
| `PrivateRoute` | `client/src/components/auth/PrivateRoute.tsx` | Authenticated users | Authed → `<Outlet/>`, the remembered user's at once while the session probe confirms them. No remembered user: while the probe runs → `PageLoader`. Unauth → `/demo-expired` if a demo ran out (`isDemoExpired()`), else `/sign-in?redirect=<path>` (`authPagePath`; no redirect when the user signed out of the page). |

## Cookie security

`server/middlewares/session.ts`:

- `httpOnly: true` — JS can't read the cookie (XSS-resistant).
- `secure: true` in production — TLS-only.
- `sameSite: "Strict"` — strongest CSRF protection.
- `path: "/"`, 7-day `maxAge`.
- Opaque UUID session ID (not a JWT). Server-side `sessions` table — instantly revocable.

## Demo lifecycle

The demo and the auth flow are mutually exclusive states. A demo user landing on any `AuthLayoutRoute` page is signed out before the page renders.

```
Demo user → /sign-in (or /sign-up, /verify-email, /forgot-password, /reset-password, /demo-expired)
   AuthLayoutRoute mounts
   useEffect: a demo at mount (isClearingDemo) ⇒ the sign-out mutation (useAuthRequests)
     POST /auth/sign-out
     Server: user.expiresAt set ⇒ Users.delete (CASCADE wipes characters,
       campaigns, forks, attachments) inside withTransaction
     Server: clears session cookie
     Client store: user=null, isAuthenticated=false
     React Query cache cleared (createQueryClient's authStore.subscribe → queryClient.clear())
   On sign-out failure (401, network): still signed out locally (the mutation's onSettled clears the session)
   Re-render: !isAuthenticated ⇒ render <Outlet/> ⇒ auth form
```

`useRef` (`demoSignOutStarted`) deduplicates the call across React StrictMode's double-effect.

### Where demo persists vs dies

| User action | Demo state |
|---|---|
| In-app navigation (`/dashboard`, `/rulesets`, …) | Persists |
| `/share/:shareToken`, `/legal` (PublicLayout) | Persists — public content doesn't end the session |
| `/sign-in`, `/sign-up`, any `AuthLayoutRoute` page | **Dies** (server hard-delete) |
| Server-side TTL expires (1 hour) | Dies (in-app expiry path, see below) |

### In-app TTL expiry

A separate flow from auth-route entry:

```
Demo user uses app, demo TTL hits server-side (1 hour)
   Next API call returns 401
   signOutIfUnauthorized (client/src/lib/queryClient.ts):
     user.expiresAt set ⇒ markDemoExpired() (the flag, in localStorage)
     clearSession()
   React re-renders ⇒ /current-path no longer matches authed Layout
   PrivateRoute: !isAuthenticated + flag set ⇒ <Navigate to="/demo-expired"/>
   AuthLayoutRoute renders /demo-expired (isDemo=false now, no signOut fires)
   DemoExpiredPage clears flag on mount
```

The flag distinguishes "your demo just expired" from "please sign in" so the user gets the right messaging.

## The session probe

The store remembers the signed-in user in `localStorage` (`auth-storage`), but the session is the cookie's, which the server alone reads (`httpOnly`). They can drift apart: a sign-in on another `localhost` port sets the cookie without touching this port's storage (cookies are shared across a host's ports, storage isn't). The server then answers as the cookie's user while the client decides permissions with the remembered one's id, and the viewer's own content shows read-only.

So the first private page a tab opens asks the server whose session the cookie is (`/auth/me`), once (`checkSession`, `client/src/components/auth/sessionCheck.ts`), and the store keeps its answer:

| The store remembers | The server answers | The store |
|---|---|---|
| A user | That user | Keeps them, with the server's fields |
| A user | Another user | Takes the server's user; the cache is cleared, as on any change of user |
| A user | 401 | Signed out (`signOutIfUnauthorized`: a demo's goes to `/demo-expired`) |
| A user | Any other failure (offline, 5xx) | Keeps them: the server can't say |
| No one | A user | Signs them in |
| No one | Any failure | Stays signed out |

The remembered user renders the page meanwhile, so a signed-in page doesn't flash signed out. An answer that comes once the store has changed (a sign-out, a profile update) changes nothing.

## Stale-cookie defense (server-side)

If the client and server desync (localStorage cleared while cookie persists, browser cookie restored from another origin, etc.), `server/services/authentication/` defends with `purgeDemoSessionUser` (`accounts.ts`):

- Called inside the `signIn` and `verifyEmail` transactions of `AuthenticationService`, and `signInAsGoogleAccount`'s, which `signInWithGoogle` runs.
- If the inbound session cookie points at a demo user, hard-deletes that user before issuing the new real session.
- Defense-in-depth — usually a no-op now that the client kills demo on `AuthLayoutRoute` entry, but still required for stale-cookie cases.

## Cross-tab behavior

The cookie is shared across tabs in the same origin. State is server-authoritative; local Zustand stores can desync transiently.

| Scenario | Behavior |
|---|---|
| Tab A (real session), Tab B opens `/sign-in` | Tab B redirects to `/dashboard`. Tab A untouched. |
| Tab A (demo), Tab B opens `/sign-in` | Tab B kills the demo server-side. Tab A's next API call → 401 → `/demo-expired`. Self-heals. |
| Tab A (real session), Tab B signs out | Tab B clears session. Tab A's next API call → 401 → `/sign-in`. |
| Tab A (demo), Tab B opens `/share/:t` | Both safe — `/share` is public-no-auth, demo persists in both tabs. |

There's no `BroadcastChannel`-based active sync today. Recovery happens lazily via the next 401 in the stale tab.

## Key files

| File | Purpose |
|---|---|
| `client/src/App.tsx` | `AppRoutes` static tree |
| `client/src/lib/queryClient.ts` | `createQueryClient`: `signOutIfUnauthorized`, the 401 handler, and the cache cleared when the user changes |
| `client/src/components/auth/AuthLayoutRoute.tsx` | `AuthLayoutRoute` — demo signOut on entry, real-user redirect (`useAuthRedirect`) |
| `client/src/components/auth/PrivateRoute.tsx` | `PrivateRoute` guard: the session probe (a `fetchQuery` of `/auth/me`, once per tab), the redirect to sign in |
| `client/src/components/auth/sessionCheck.ts` | `checkSession`: the store takes the probe's answer (see [The session probe](#the-session-probe)) |
| `client/src/components/layout/PublicLayout.tsx` | Public toolbar with auth-aware CTA |
| `client/src/components/layout/Layout.tsx` | In-app shell, `isDemo` feature gates |
| `client/src/stores/authStore.ts` | Zustand store + persist: who is signed in, the emails waiting for a code; `startSession`, `clearSession`, `updateUser` |
| `client/src/hooks/useAuthRequests.ts` | The auth requests as mutations the store follows (sign in / up / out, start a demo, verify, reset), and their shared `pending` |
| `client/src/stores/demoExpiredStorage.ts` | The demo-expired flag: `markDemoExpired`, `isDemoExpired`, `clearDemoExpired` |
| `client/src/pages/demo-expired/DemoExpiredPage.tsx` | Post-expiry messaging; clears flag on mount |
| `server/middlewares/session.ts` | Cookie config, session validation middleware |
| `server/middlewares/denyDemoUser.ts` | Server-side gate for collaboration/profile mutations |
| `server/services/authentication/AuthenticationService.ts` | `signIn`, `signInWithGoogle`, `signUp`, `verifyEmail`, `signOut`, `startDemo` |
| `server/services/authentication/accounts.ts` | `purgeDemoSessionUser`, `signInAsGoogleAccount`, `openSession`, `toSafeUser` |
| `server/routers/authentication/index.ts` | `/auth/*` routes: `signedOut/` (sign up, sign in, password reset), mounted before `signedIn/` (`/me`, sign out, the account and linked accounts behind the session middleware) |
| `server/routers/api/demo/index.ts` | `/api/demo/start` route |
| `server/routers/api/shared/index.ts` | `/api/shared/*` public routes (no auth middleware) |

Password recovery revokes every existing session in the same transaction as the password update. An authenticated password change revokes other sessions while preserving the current session. Invalid reset codes and failed password changes do not revoke sessions.
