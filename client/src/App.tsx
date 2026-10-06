import CssBaseline from "@mui/material/CssBaseline";
import { QueryClientProvider } from "@tanstack/react-query";
import { lazy, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";

import { AuthLayoutRoute } from "@/client/src/components/auth/index.ts";
import { ErrorBoundary } from "@/client/src/components/common/index.ts";
import { Layout, PublicLayout } from "@/client/src/components/layout/index.ts";
import { CustomThemeProvider } from "@/client/src/contexts/ThemeContext.tsx";
import { SnackbarProvider } from "@/client/src/contexts/ToastContext.tsx";
import { WebSocketProvider } from "@/client/src/contexts/WebSocketContext.tsx";
import { checkSession } from "@/client/src/hooks/index.ts";
import { DEMO_EXPIRED_FLAG } from "@/client/src/lib/demo.ts";
import { createQueryClient } from "@/client/src/lib/queryClient.ts";
import SignIn from "@/client/src/pages/auth/SignIn.tsx";
import DashboardPage from "@/client/src/pages/dashboard/DashboardPage.tsx";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

import "./App.css";

const AbilityDetailPage = lazy(() => import("@/client/src/pages/rulesets/details/entities/AbilityDetailPage.tsx"));
const ActivitiesPage = lazy(() => import("@/client/src/pages/activities/ActivitiesPage.tsx"));
const AptitudeDetailPage = lazy(() => import("@/client/src/pages/rulesets/details/entities/AptitudeDetailPage.tsx"));
/**
 * One-shot per browser-tab: probe /auth/me at most once even if the visitor bounces between auth-only routes while
 * unauth. Memoizing a Promise (rather than a boolean "started" flag) keeps strict-mode's double-effect honest — each
 * mount awaits the same probe and attaches its own .finally, so the surviving mount's callback fires after the first
 * cleanup cancels its peer.
 */
let authProbe: Promise<void> | null = null;
const CampaignCharacterPage = lazy(() => import("@/client/src/pages/campaigns/CampaignCharacterPage.tsx"));
const CampaignDetailsPage = lazy(() => import("@/client/src/pages/campaigns/details/CampaignDetailsPage.tsx"));
const CampaignInvitePage = lazy(() => import("@/client/src/pages/campaign-invite/CampaignInvitePage.tsx"));
const CampaignsPage = lazy(() => import("@/client/src/pages/campaigns/CampaignsPage.tsx"));
const CharacterContributorInvitePage = lazy(
  () => import("@/client/src/pages/character-contributor-invite/CharacterContributorInvitePage.tsx"),
);
const CharacterDetailsPage = lazy(() => import("@/client/src/pages/characters/details/CharacterDetailsPage.tsx"));
const CharactersPage = lazy(() => import("@/client/src/pages/characters/CharactersPage.tsx"));
const ClassDetailsPage = lazy(() => import("@/client/src/pages/rulesets/details/classes/ClassDetailsPage.tsx"));
const CustomizationPage = lazy(() => import("@/client/src/pages/rulesets/customization/CustomizationPage.tsx"));
const DemoExpiredPage = lazy(() => import("@/client/src/pages/demo-expired/DemoExpiredPage.tsx"));
const ForgotPassword = lazy(() => import("@/client/src/pages/auth/ForgotPassword.tsx"));
const LanguageDetailPage = lazy(() => import("@/client/src/pages/rulesets/details/entities/LanguageDetailPage.tsx"));
const LegalPage = lazy(() => import("@/client/src/pages/legal/LegalPage.tsx"));
const MechanicDetailPage = lazy(() => import("@/client/src/pages/rulesets/details/entities/MechanicDetailPage.tsx"));
const NotificationsPage = lazy(() => import("@/client/src/pages/notifications/NotificationsPage.tsx"));
const ProfilePage = lazy(() => import("@/client/src/pages/profile/ProfilePage.tsx"));
const queryClient = createQueryClient();
const ResetPassword = lazy(() => import("@/client/src/pages/auth/ResetPassword.tsx"));
const RulesetContributorInvitePage = lazy(
  () => import("@/client/src/pages/ruleset-contributor-invite/RulesetContributorInvitePage.tsx"),
);
const RulesetDetailsPage = lazy(() => import("@/client/src/pages/rulesets/details/RulesetDetailsPage.tsx"));
const RulesetsPage = lazy(() => import("@/client/src/pages/rulesets/RulesetsPage.tsx"));
const SaveDetailPage = lazy(() => import("@/client/src/pages/rulesets/details/entities/SaveDetailPage.tsx"));
const SettingsPage = lazy(() => import("@/client/src/pages/settings/SettingsPage.tsx"));
const SharedCharacterPage = lazy(() => import("@/client/src/pages/shared/SharedCharacterPage.tsx"));
const SignUp = lazy(() => import("@/client/src/pages/auth/SignUp.tsx"));

const SkillDetailPage = lazy(() => import("@/client/src/pages/rulesets/details/entities/SkillDetailPage.tsx"));

const VerifyEmail = lazy(() => import("@/client/src/pages/auth/VerifyEmail.tsx"));

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <CustomThemeProvider>
            <SnackbarProvider>
              <WebSocketProvider>
                <CssBaseline />
                <AppRoutes />
              </WebSocketProvider>
            </SnackbarProvider>
          </CustomThemeProvider>
        </QueryClientProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<AuthLayoutRoute />}>
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/sign-up" element={<SignUp />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/demo-expired" element={<DemoExpiredPage />} />
      </Route>

      <Route element={<PublicLayout />}>
        <Route path="/share/:shareToken" element={<SharedCharacterPage />} />
        <Route path="/legal" element={<LegalPage />} />
      </Route>

      <Route element={<PrivateRoute />}>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="rulesets" element={<RulesetsPage />} />
          <Route path="rulesets/:id" element={<RulesetDetailsPage />} />
          <Route path="rulesets/:id/:section" element={<RulesetDetailsPage />} />

          {/* Entity detail pages (non-customizable) */}
          <Route path="rulesets/:id/languages/:languageId" element={<LanguageDetailPage />} />
          <Route path="rulesets/:id/skills/:skillId" element={<SkillDetailPage />} />
          <Route path="rulesets/:id/saves/:saveId" element={<SaveDetailPage />} />
          <Route path="rulesets/:id/mechanics/:mechanicId" element={<MechanicDetailPage />} />
          <Route path="rulesets/:id/aptitudes/:aptitudeId" element={<AptitudeDetailPage />} />
          <Route path="rulesets/:id/abilities/:abilityId" element={<AbilityDetailPage />} />

          {/* Class detail page */}
          <Route path="rulesets/:id/classes/:classId" element={<ClassDetailsPage />} />
          <Route path="rulesets/:id/classes/:classId/:section" element={<ClassDetailsPage />} />

          {/* Customization pages (new URL structure: /:entityType/:entityId/customization) */}
          <Route path="rulesets/:id/:entityType/:entityId/customization" element={<CustomizationPage />} />
          <Route path="rulesets/:id/:entityType/:entityId/customization/:section" element={<CustomizationPage />} />
          <Route path="campaigns" element={<CampaignsPage />} />
          <Route path="campaigns/:id" element={<CampaignDetailsPage />} />
          <Route path="campaigns/:id/:section" element={<CampaignDetailsPage />} />
          <Route path="campaigns/:id/characters/:characterId" element={<CampaignCharacterPage />} />
          <Route path="characters" element={<CharactersPage />} />
          <Route path="characters/:id" element={<CharacterDetailsPage />} />
          <Route path="activities" element={<ActivitiesPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="campaign-invite/:inviteId" element={<CampaignInvitePage />} />
          <Route path="ruleset-contributor-invite/:contributorId" element={<RulesetContributorInvitePage />} />
          <Route path="character-contributor-invite/:contributorId" element={<CharacterContributorInvitePage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}

function PrivateRoute() {
  const location = useLocation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const signedOutByUser = useAuthStore((s) => s.signedOutByUser);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    authProbe ??= checkSession(queryClient);
    let cancelled = false;
    void authProbe.finally(() => {
      if (!cancelled) setChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!checked && !isAuthenticated) return null;
  if (isAuthenticated) return <Outlet />;

  // Read-only here; DemoExpiredPage clears the flag on mount. Mutating during
  // render is unsafe under StrictMode's double-invoke (the second pass would
  // see an already-cleared flag and fall through to /sign-in).
  let demoExpired = false;
  try {
    demoExpired = !!localStorage.getItem(DEMO_EXPIRED_FLAG);
  } catch {
    // storage disabled
  }
  if (demoExpired) return <Navigate to="/demo-expired" replace />;

  // Back to the page once signed in, unless the user signed out of it
  const target = location.pathname + location.search;
  const redirectParam = target !== "/" && !signedOutByUser ? `?redirect=${encodeURIComponent(target)}` : "";
  return <Navigate to={`/sign-in${redirectParam}`} replace />;
}

export default App;
