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
│   └── /share/:shareToken
│
└── PrivateRoute       ── auth-required; redirects unauth
    └── <Layout>
        ├── /  (index → /dashboard)
        ├── /dashboard, /rulesets, /campaigns, /characters, …
        └── *  (catch-all → /dashboard)
```

| Wrapper | File | Renders for | Guard behavior |
|---|---|---|---|
| `AuthLayoutRoute` | `client/src/components/auth/AuthLayout.tsx` | Unauth users on auth-flow pages | Demo → `signOut()` then form. Real user → `/dashboard`. Unauth → form. |
| `PublicLayout` | `client/src/components/layout/PublicLayout.tsx` | Anyone | None. Toolbar swaps "Sign up" ↔ "Dashboard" by auth state. |
| `PrivateRoute` | `client/src/App.tsx` (helper) | Authenticated users | Authed → `<Outlet/>`. Unauth → `/demo-expired` if `DEMO_EXPIRED_FLAG` set, else `/sign-in?redirect=<path>`. |

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
   useEffect: isDemo === true ⇒ signOut()
     POST /auth/sign-out
     Server: user.expiresAt set ⇒ Users.delete (CASCADE wipes characters,
       campaigns, forks, attachments) inside withTransaction
     Server: clears session cookie
     Client store: user=null, isAuthenticated=false
     React Query cache cleared (App.tsx authStore.subscribe → queryClient.clear())
   On signOut failure (401, network): clearSession() fallback locally
   Re-render: !isAuthenticated ⇒ render <Outlet/> ⇒ auth form
```

`useRef` (`demoSignOutStarted`) deduplicates the call across React StrictMode's double-effect.

### Where demo persists vs dies

| User action | Demo state |
|---|---|
| In-app navigation (`/dashboard`, `/rulesets`, …) | Persists |
| `/share/:shareToken` (PublicLayout) | Persists — public content doesn't end the session |
| `/sign-in`, `/sign-up`, any `AuthLayoutRoute` page | **Dies** (server hard-delete) |
| Server-side TTL expires (1 hour) | Dies (in-app expiry path, see below) |

### In-app TTL expiry

A separate flow from auth-route entry:

```
Demo user uses app, demo TTL hits server-side (1 hour)
   Next API call returns 401
   handleGlobalError (client/src/App.tsx):
     user.expiresAt set ⇒ localStorage.setItem(DEMO_EXPIRED_FLAG, "1")
     clearSession()
   React re-renders ⇒ /current-path no longer matches authed Layout
   PrivateRoute: !isAuthenticated + flag set ⇒ <Navigate to="/demo-expired"/>
   AuthLayoutRoute renders /demo-expired (isDemo=false now, no signOut fires)
   DemoExpiredPage clears flag on mount
```

The flag distinguishes "your demo just expired" from "please sign in" so the user gets the right messaging.

## Stale-cookie defense (server-side)

If the client and server desync (localStorage cleared while cookie persists, browser cookie restored from another origin, etc.), `server/services/AuthenticationService.ts` defends with `purgeDemoSessionUser`:

- Called inside `signIn`, `verifyEmail`, `signInWithGoogle` transactions.
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
| `client/src/App.tsx` | `AppRoutes` static tree, `PrivateRoute` guard, `handleGlobalError` 401 handler |
| `client/src/components/auth/AuthLayout.tsx` | `AuthLayoutRoute` — demo signOut on entry, real-user redirect |
| `client/src/components/layout/PublicLayout.tsx` | Public toolbar with auth-aware CTA |
| `client/src/components/layout/Layout.tsx` | In-app shell, `isDemo` feature gates |
| `client/src/stores/authStore.ts` | Zustand store + persist; `signOut`, `clearSession`, `checkAuth` |
| `client/src/lib/demo.ts` | `DEMO_EXPIRED_FLAG` constant |
| `client/src/pages/demo-expired/DemoExpiredPage.tsx` | Post-expiry messaging; clears flag on mount |
| `client/src/hooks/useStartDemo.ts` | POSTs `/api/demo/start`, navigates to `/dashboard` |
| `server/middlewares/session.ts` | Cookie config, session validation middleware |
| `server/middlewares/denyDemoUser.ts` | Server-side gate for collaboration/profile mutations |
| `server/services/AuthenticationService.ts` | `signIn`, `signUp`, `verifyEmail`, `signOut`, `startDemo`, `purgeDemoSessionUser` |
| `server/routers/authentication/index.ts` | `/auth/*` routes |
| `server/routers/api/demo/index.ts` | `/api/demo/start` route |
| `server/routers/api/shared/index.tsx` | `/api/shared/*` public routes (no auth middleware) |
