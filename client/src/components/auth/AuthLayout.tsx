import { Alert, alpha, Box, Link as MuiLink, Paper, Stack, Typography, useTheme } from "@mui/material";
import { type ReactNode, Suspense, useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation, useSearchParams } from "react-router-dom";

import { DiceSpinner, PageTransition, Section } from "@/client/src/components/common/index.ts";
import { useAuthRequests, useIsMobile, useStartDemo } from "@/client/src/hooks/index.ts";
import { DURATION, EASING, fadeInUp, prefersReducedMotion } from "@/client/src/lib/animations.ts";
import { externalLinks } from "@/client/src/lib/externalLinks.ts";
import { safeRedirectPath } from "@/client/src/lib/safeRedirect.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { brandGold, brandGoldTint } from "@/client/src/theme/brandGold.ts";
import { iconGlow, textLift } from "@/client/src/theme/shadows.ts";

interface AuthPageProps {
  children: ReactNode;
  title: string;
  subtitle?: ReactNode;
  /** The last request's failure, shown above the form. */
  error?: string | null;
  /** A confirmation shown above the form ("A new code has been sent"). */
  notice?: string | null;
}

function AuthFooterLinks() {
  const { start, isPending } = useStartDemo();
  // The demo is for newcomers, so only sign-up offers it.
  const showDemo = useLocation().pathname === "/sign-up";
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        maxWidth: 450,
      }}
    >
      {showDemo && (
        <>
          <MuiLink
            component="button"
            type="button"
            onClick={() => start()}
            disabled={isPending}
            variant="body2"
            underline="hover"
            sx={{ color: "text.secondary", background: "none", border: 0, cursor: "pointer", p: 0 }}
          >
            {isPending ? "Starting…" : "Try the demo"}
          </MuiLink>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            |
          </Typography>
        </>
      )}
      <MuiLink
        href={externalLinks.source}
        target="_blank"
        rel="noopener noreferrer"
        variant="body2"
        underline="hover"
        sx={{ color: "text.secondary", py: 1.5 }}
      >
        Source
      </MuiLink>
    </Stack>
  );
}

/** The branding panel on a wide screen, which the layout route renders once. */
function DesktopBranding() {
  const theme = useTheme();
  const darkMode = theme.palette.mode === "dark";

  const gold = brandGold(darkMode);
  const goldFaint = brandGoldTint(darkMode, darkMode ? 0.12 : 0.1);

  const animBase = {
    [prefersReducedMotion]: { animation: "none" },
  } as const;

  const stagger = (i: number) => ({
    animation: `${fadeInUp} ${DURATION.slow}ms ${EASING.decelerate} ${i * DURATION.stagger}ms both`,
    ...animBase,
  });

  return (
    <Stack
      spacing={2}
      sx={{
        position: "relative",
        width: "45%",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(160deg, ${theme.palette.backdrop.top} 0%, ${theme.palette.backdrop.middle} 50%, ${theme.palette.backdrop.bottom} 100%)`,
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
          borderColor: gold,
          opacity: 0.3,
          borderTopLeftRadius: 4,
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
          borderColor: gold,
          opacity: 0.3,
          borderBottomRightRadius: 4,
        }}
      />

      {/* Radial glow behind icon */}
      <Box
        sx={{
          position: "absolute",
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${goldFaint} 0%, transparent 70%)`,
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
          filter: iconGlow(brandGold(false)),
          ...stagger(0),
        }}
      />

      {/* Title */}
      <Typography
        component="p"
        variant="h3"
        sx={{
          color: "common.white",
          fontWeight: "fontWeightBold",
          textShadow: textLift,
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
          background: `linear-gradient(90deg, transparent, ${gold}, transparent)`,
          borderRadius: 1,
          position: "relative",
          ...stagger(2),
        }}
      />

      {/* Tagline */}
      <Typography
        component="p"
        variant="subtitle1"
        sx={{
          color: alpha(theme.palette.common.white, 0.7),
          fontStyle: "italic",
          textAlign: "center",
          position: "relative",
          ...stagger(3),
        }}
      >
        A programmable engine for tabletop rulesets
      </Typography>
    </Stack>
  );
}

/** The branding on a small screen, above the page, which the layout route renders once. */
function MobileBranding() {
  const theme = useTheme();

  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{
        alignItems: "center",
        px: 2,
        py: 2.5,
        background: `linear-gradient(135deg, ${theme.palette.backdrop.top}, ${theme.palette.backdrop.middle})`,
        borderRadius: 1,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
      }}
    >
      <Box
        component="img"
        src="/pwa-192x192.png"
        alt="Arkyvree"
        sx={{ width: 48, height: 48, filter: iconGlow(brandGold(false)) }}
      />
      <Box>
        <Typography
          component="p"
          variant="h5"
          sx={{
            color: "common.white",
            fontWeight: "fontWeightBold",
            textShadow: textLift,
          }}
        >
          Arkyvree
        </Typography>
        <Typography variant="body2" sx={{ color: alpha(theme.palette.common.white, 0.6), fontStyle: "italic" }}>
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
  const [searchParams] = useSearchParams();
  // Where a user signing in was going: the page that sent them to sign in, which verifying an email carries along
  const destination = safeRedirectPath(searchParams.get("redirect") ?? location.state?.redirect) ?? "/dashboard";

  // Demo sessions live only inside the app — drop the demo on entry to any auth route.
  // A sign-out that fails (server already 401'd, network blip) still ends signed out locally: the server-side demo may
  // already be gone.
  useEffect(() => {
    if (!isClearingDemo || demoSignOutStarted.current) return;
    demoSignOutStarted.current = true;
    signOutDemo(undefined, { onSettled: () => setIsClearingDemo(false) });
  }, [isClearingDemo, signOutDemo]);

  if (isClearingDemo) {
    return <DiceSpinner sx={{ minHeight: "100vh" }} />;
  }

  if (isAuthenticated) {
    return <Navigate to={destination} replace />;
  }

  if (isMobile) {
    return (
      <Stack spacing={2} sx={{ minHeight: "100vh", justifyContent: "center", px: 2, py: 4 }}>
        <Paper sx={{ width: "100%", maxWidth: 450, mx: "auto", overflow: "hidden" }}>
          <MobileBranding />
          <Suspense fallback={<DiceSpinner sx={{ py: 8 }} />}>
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
        <Suspense fallback={<DiceSpinner sx={{ py: 8 }} />}>
          <Outlet />
        </Suspense>
        <AuthFooterLinks />
      </Stack>
    </Stack>
  );
}

/** The frame each auth page puts its content in: its title, subtitle, error and notice. */
export function AuthPage({ children, title, subtitle, error, notice }: AuthPageProps) {
  return (
    <PageTransition sx={{ width: "100%", maxWidth: 450 }}>
      <Section>
        <Stack
          spacing={3}
          sx={{
            animation: `${fadeInUp} ${DURATION.slow}ms ${EASING.decelerate} both`,
            [prefersReducedMotion]: { animation: "none" },
          }}
        >
          <Box>
            <Typography component="h1" variant="h3" gutterBottom align="center">
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="body2" align="center">
                {subtitle}
              </Typography>
            )}
          </Box>

          {error && <Alert severity="error">{error}</Alert>}
          {notice && <Alert severity="success">{notice}</Alert>}

          {children}
        </Stack>
      </Section>
    </PageTransition>
  );
}
