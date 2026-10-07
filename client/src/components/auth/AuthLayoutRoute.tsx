import { Alert, alpha, Box, Link as MuiLink, Paper, Stack, Typography } from "@mui/material";
import { type ReactNode, Suspense, useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { DiceSpinner, LinkButton, PageLoader, PageTransition, Panel } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useAuthRequests, useIsMobile, useSearchParam } from "@/client/src/hooks/index.ts";
import { EXTERNAL_LINKS } from "@/client/src/lib/externalLinks.ts";
import { safeRedirectPath } from "@/client/src/lib/safeRedirect.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { DURATION, EASING, fadeInUp, PREFERS_REDUCED_MOTION } from "@/client/src/theme/animations.ts";

interface AuthPageProps {
  children: ReactNode;
  /** The last request's failure, shown above the form. */
  error?: string | null;
  /** A confirmation shown above the form ("A new code has been sent"). */
  notice?: string | null;
  subtitle?: ReactNode;
  title: string;
}

function AuthFooterLinks() {
  const snackbar = useSnackbar();
  const { startDemo, pending } = useAuthRequests();
  // The demo is for newcomers, so only sign-up offers it.
  const showDemo = useLocation().pathname === "/sign-up";
  return (
    <Stack
      direction="row"
      sx={{
        flexWrap: "wrap",
        columnGap: { xs: 1, sm: 2 },
        rowGap: 0.5,
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        maxWidth: 450,
      }}
    >
      {showDemo && (
        <>
          <LinkButton
            onClick={() =>
              startDemo.mutate(undefined, { onError: (error) => snackbar.error(error, "Failed to start demo") })
            }
            disabled={pending}
            variant="body2"
            sx={{ color: "text.secondary", background: "none", border: 0, cursor: "pointer", p: 0 }}
          >
            <DiceSpinner size="small" loading={startDemo.isPending}>
              Try the Demo
            </DiceSpinner>
          </LinkButton>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            |
          </Typography>
        </>
      )}
      <Stack
        component={MuiLink}
        direction="row"
        href={EXTERNAL_LINKS.source}
        target="_blank"
        rel="noopener noreferrer"
        variant="body2"
        underline="hover"
        sx={{ color: "text.secondary", display: "inline-flex", alignItems: "center", minHeight: 44 }}
      >
        Source
      </Stack>
    </Stack>
  );
}

/** The branding panel on a wide screen, which the layout route renders once. */
function DesktopBranding() {
  const animBase = {
    [PREFERS_REDUCED_MOTION]: { animation: "none" },
  } as const;

  const stagger = (i: number) => ({
    animation: `${fadeInUp} ${DURATION.slow}ms ${EASING.decelerate} ${i * DURATION.slowStagger}ms both`,
    ...animBase,
  });

  return (
    <Stack
      spacing={3}
      sx={{
        position: "relative",
        width: "45%",
        alignItems: "center",
        justifyContent: "center",
        background: (theme) =>
          `linear-gradient(160deg, ${theme.palette.backdrop.top} 0%, ${theme.palette.backdrop.middle} 50%, ${theme.palette.backdrop.bottom} 100%)`,
        overflow: "hidden",
        py: 6,
        px: 4,
      }}
    >
      {/* Corner filigree top-left */}
      <Box
        sx={{
          position: "absolute",
          top: 16,
          left: 16,
          width: 40,
          height: 40,
          borderTop: 2,
          borderLeft: 2,
          borderColor: "gold.main",
          opacity: 0.3,
          borderRadius: 0.5,
        }}
      />
      {/* Corner filigree bottom-right */}
      <Box
        sx={{
          position: "absolute",
          bottom: 16,
          right: 16,
          width: 40,
          height: 40,
          borderBottom: 2,
          borderRight: 2,
          borderColor: "gold.main",
          opacity: 0.3,
          borderRadius: 0.5,
        }}
      />

      {/* Radial glow behind icon */}
      <Box
        sx={{
          position: "absolute",
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: (theme) => `radial-gradient(circle, ${theme.palette.gold.faint} 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />

      {/* Icon */}
      <Box
        component="img"
        src="/pwa-512x512.png"
        alt="Arkyvree"
        sx={{
          width: 120,
          height: 120,
          position: "relative",
          filter: (theme) => theme.dropShadows.authLogo,
          ...stagger(0),
        }}
      />

      <Stack spacing={2} sx={{ alignItems: "center" }}>
        {/* Title */}
        <Typography
          variant="h3"
          component="p"
          sx={{
            color: "common.white",
            fontWeight: 700,
            letterSpacing: "0.04em",
            textShadow: (theme) => theme.textShadows.brand,
            textAlign: "center",
            position: "relative",
            ...stagger(1),
          }}
        >
          Arkyvree
        </Typography>

        {/* Gold gradient divider */}
        <Box
          sx={{
            width: 120,
            height: 2,
            background: (theme) => `linear-gradient(90deg, transparent, ${theme.palette.gold.main}, transparent)`,
            borderRadius: 1,
            position: "relative",
            ...stagger(2),
          }}
        />

        {/* Tagline */}
        <Typography
          variant="subtitle1"
          component="p"
          sx={{
            color: (theme) => alpha(theme.palette.common.white, 0.7),
            fontStyle: "italic",
            textAlign: "center",
            position: "relative",
            ...stagger(3),
          }}
        >
          A programmable engine for tabletop rulesets
        </Typography>
      </Stack>
    </Stack>
  );
}

/** The branding on a small screen, above the page, which the layout route renders once. */
function MobileBranding() {
  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{
        alignItems: "center",
        px: 2,
        py: 2.5,
        background: (theme) =>
          `linear-gradient(135deg, ${theme.palette.backdrop.top}, ${theme.palette.backdrop.middle})`,
        borderRadius: 1,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
      }}
    >
      <Box
        component="img"
        src="/pwa-192x192.png"
        alt="Arkyvree"
        sx={{ width: 48, height: 48, filter: (theme) => theme.dropShadows.authLogoCompact }}
      />
      <Box>
        <Typography
          variant="h5"
          component="p"
          sx={{
            color: "common.white",
            fontWeight: 700,
            letterSpacing: "0.03em",
            textShadow: (theme) => theme.textShadows.brandCompact,
            lineHeight: 1.2,
          }}
        >
          Arkyvree
        </Typography>
        <Typography
          variant="body2"
          sx={{ color: (theme) => alpha(theme.palette.common.white, 0.6), fontStyle: "italic" }}
        >
          A programmable engine for tabletop rulesets
        </Typography>
      </Box>
    </Stack>
  );
}

/** The auth pages' layout route: it renders the branding once, and each page swaps in at its `<Outlet>`. */
export function AuthLayoutRoute() {
  const isMobile = useIsMobile();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isDemo = useAuthStore((s) => !!s.user?.expiresAt);

  // Only kill the demo if we were already one at mount — a freshly-created
  // demo on /sign-up must survive the route change.
  const [isClearingDemo, setIsClearingDemo] = useState(isDemo);
  const demoSignOutStarted = useRef(false);
  const { signOut } = useAuthRequests();
  const signOutDemo = signOut.mutate;
  const location = useLocation();
  const { value: redirectParam } = useSearchParam("redirect");
  // Where a user signing in was going: the page that sent them to sign in, which verifying an email carries along
  const destination = safeRedirectPath(redirectParam || location.state?.redirect) ?? "/dashboard";

  // Demo sessions live only inside the app — drop the demo on entry to any auth route.
  // A sign-out that fails (server already 401'd, network blip) still ends signed out locally: the server-side demo may
  // already be gone.
  useEffect(() => {
    if (!isClearingDemo || demoSignOutStarted.current) return;
    demoSignOutStarted.current = true;
    signOutDemo(undefined, { onSettled: () => setIsClearingDemo(false) });
  }, [isClearingDemo, signOutDemo]);

  if (isClearingDemo) return <PageLoader />;

  if (isAuthenticated) return <Navigate to={destination} replace />;

  if (isMobile) {
    return (
      <Stack spacing={2} sx={{ minHeight: "100vh", justifyContent: "center", px: 2, py: 4 }}>
        <Paper sx={{ width: "100%", maxWidth: 450, mx: "auto", overflow: "hidden" }}>
          <MobileBranding />
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </Paper>
        <AuthFooterLinks />
      </Stack>
    );
  }

  return (
    <Stack direction="row" sx={{ minHeight: "100vh" }}>
      <DesktopBranding />

      <Stack spacing={2} sx={{ flex: 1, alignItems: "center", justifyContent: "center", px: 4 }}>
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
        <AuthFooterLinks />
      </Stack>
    </Stack>
  );
}

/** The frame each auth page puts its content in: its title, subtitle, error and notice. */
export function AuthPage({ children, title, subtitle, error, notice }: AuthPageProps) {
  const isMobile = useIsMobile();
  const page = (
    <Stack
      sx={{
        animation: `${fadeInUp} ${DURATION.slow}ms ${EASING.decelerate} both`,
        [PREFERS_REDUCED_MOTION]: { animation: "none" },
      }}
    >
      <Typography sx={{ typography: { xs: "h5", sm: "h4" }, textAlign: "center" }} component="h1" gutterBottom>
        {title}
      </Typography>

      <Stack spacing={3}>
        {subtitle && (
          <Typography variant="body2" sx={{ textAlign: "center" }}>
            {subtitle}
          </Typography>
        )}

        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          {notice && <Alert severity="success">{notice}</Alert>}
          <Box>{children}</Box>
        </Stack>
      </Stack>
    </Stack>
  );

  return (
    <PageTransition sx={{ width: "100%", maxWidth: 450 }}>
      {/* On a phone the layout's panel frames the page, under the brand: no panel in a panel */}
      {isMobile ? <Box sx={{ p: { xs: 2, sm: 4 } }}>{page}</Box> : <Panel>{page}</Panel>}
    </PageTransition>
  );
}
