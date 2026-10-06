import { Alert, Box, Card, CardContent, Link as MuiLink, Typography, useTheme } from "@mui/material";
import { type ReactNode, Suspense, useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { DiceSpinner, PageTransition } from "@/client/src/components/common/index.ts";
import { useAuthRequests, useIsMobile, useStartDemo } from "@/client/src/hooks/index.ts";
import { DURATION, EASING, fadeInUp, prefersReducedMotion } from "@/client/src/lib/animations.ts";
import { brandGold, brandGoldTint } from "@/client/src/lib/brandGold.ts";
import { externalLinks } from "@/client/src/lib/externalLinks.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

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
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        columnGap: { xs: 1, sm: 2 },
        rowGap: 0.5,
        mt: 2,
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
        sx={{ color: "text.secondary", display: "inline-flex", alignItems: "center", minHeight: 44 }}
      >
        Source
      </MuiLink>
    </Box>
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
    animation: `${fadeInUp} ${DURATION.slow}ms ${EASING.decelerate} ${i * 80}ms both`,
    ...animBase,
  });

  return (
    <Box
      sx={{
        position: "relative",
        width: "45%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: darkMode
          ? "linear-gradient(160deg, #3d2020 0%, #2a1515 50%, #1a0f0f 100%)"
          : "linear-gradient(160deg, #8d1e1e 0%, #6b1717 50%, #4a1010 100%)",
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
          borderTop: `2px solid ${gold}`,
          borderLeft: `2px solid ${gold}`,
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
          borderBottom: `2px solid ${gold}`,
          borderRight: `2px solid ${gold}`,
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
          filter: `drop-shadow(0 4px 12px ${brandGoldTint(false, darkMode ? 0.4 : 0.3)})`,
          ...stagger(0),
        }}
      />

      {/* Title */}
      <Typography
        variant="h3"
        sx={{
          mt: 3,
          color: "#fff",
          fontWeight: 700,
          letterSpacing: "0.04em",
          textShadow: "0 2px 4px rgba(0,0,0,0.4)",
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
          mt: 2,
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
        variant="subtitle1"
        sx={{
          mt: 2,
          color: "rgba(255,255,255,0.7)",
          fontStyle: "italic",
          textAlign: "center",
          position: "relative",
          ...stagger(3),
        }}
      >
        A programmable engine for tabletop rulesets
      </Typography>
    </Box>
  );
}

/** The branding on a small screen, above the page, which the layout route renders once. */
function MobileBranding() {
  const theme = useTheme();
  const darkMode = theme.palette.mode === "dark";

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        px: 2,
        py: 2.5,
        background: darkMode
          ? "linear-gradient(135deg, #3d2020, #2a1515)"
          : "linear-gradient(135deg, #8d1e1e, #6b1717)",
        borderRadius: "8px 8px 0 0",
      }}
    >
      <Box
        component="img"
        src="/pwa-192x192.png"
        alt="Arkyvree"
        sx={{ width: 48, height: 48, filter: `drop-shadow(0 2px 6px ${brandGoldTint(false, 0.3)})` }}
      />
      <Box>
        <Typography
          variant="h5"
          sx={{
            color: "#fff",
            fontWeight: 700,
            letterSpacing: "0.03em",
            textShadow: "0 1px 3px rgba(0,0,0,0.3)",
            lineHeight: 1.2,
          }}
        >
          Arkyvree
        </Typography>
        <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.6)", fontStyle: "italic" }}>
          A programmable engine for tabletop rulesets
        </Typography>
      </Box>
    </Box>
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
  const { signOut } = useAuthRequests({ onSignedOut: () => setIsClearingDemo(false) });
  const signOutDemo = signOut.mutate;

  // Demo sessions live only inside the app — drop the demo on entry to any auth route.
  // A sign-out that fails (server already 401'd, network blip) still ends signed out locally: the server-side demo may
  // already be gone.
  useEffect(() => {
    if (!isClearingDemo || demoSignOutStarted.current) return;
    demoSignOutStarted.current = true;
    signOutDemo();
  }, [isClearingDemo, signOutDemo]);

  if (isClearingDemo) {
    return <DiceSpinner sx={{ minHeight: "100vh" }} />;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  if (isMobile) {
    return (
      <Box
        sx={{ display: "flex", flexDirection: "column", minHeight: "100vh", justifyContent: "center", px: 2, py: 4 }}
      >
        <Card sx={{ width: "100%", maxWidth: 450, mx: "auto", overflow: "hidden" }}>
          <MobileBranding />
          <Suspense fallback={<DiceSpinner sx={{ py: 8 }} />}>
            <Outlet />
          </Suspense>
        </Card>
        <AuthFooterLinks />
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <DesktopBranding />

      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          px: 4,
        }}
      >
        <Suspense fallback={<DiceSpinner sx={{ py: 8 }} />}>
          <Outlet />
        </Suspense>
        <AuthFooterLinks />
      </Box>
    </Box>
  );
}

/** The frame each auth page puts its content in: its title, subtitle, error and notice. */
export function AuthPage({ children, title, subtitle, error, notice }: AuthPageProps) {
  return (
    <PageTransition>
      <Card sx={{ width: "100%", maxWidth: 450 }}>
        <CardContent sx={{ p: { xs: 2, sm: 4 } }}>
          <Box
            sx={{
              animation: `${fadeInUp} ${DURATION.slow}ms ${EASING.decelerate} both`,
              [prefersReducedMotion]: { animation: "none" },
            }}
          >
            <Typography sx={{ typography: { xs: "h5", sm: "h4" } }} component="h1" gutterBottom align="center">
              {title}
            </Typography>

            {subtitle && (
              <Typography variant="body2" align="center" sx={{ mb: 3 }}>
                {subtitle}
              </Typography>
            )}

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            {notice && (
              <Alert severity="success" sx={{ mb: 2 }}>
                {notice}
              </Alert>
            )}

            {children}
          </Box>
        </CardContent>
      </Card>
    </PageTransition>
  );
}
