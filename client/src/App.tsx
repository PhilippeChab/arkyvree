import { CssBaseline } from "@mui/material";
import { QueryClientProvider } from "@tanstack/react-query";
import { lazy, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";

import { AuthLayoutRoute } from "./components/auth/index.ts";
import { ErrorBoundary } from "./components/common/index.ts";
import { Layout, PublicLayout } from "./components/layout/index.ts";
import { CustomThemeProvider } from "./contexts/CustomThemeProvider.tsx";
import { SnackbarProvider } from "./contexts/SnackbarProvider.tsx";
import { WebSocketProvider } from "./contexts/WebSocketProvider.tsx";
import { checkSession } from "./hooks/index.ts";
import { createQueryClient } from "./lib/queryClient.ts";
import SignInPage from "./pages/auth/SignInPage.tsx";
import DashboardPage from "./pages/dashboard/DashboardPage.tsx";
import { useAuthStore } from "./stores/authStore.ts";
import { isDemoExpired } from "./stores/demoExpiredFlag.ts";

import "./App.css";

const AbilityDetailsPage = lazy(() => import("./pages/rulesets/details/entities/AbilityDetailsPage.tsx"));
const ActivitiesPage = lazy(() => import("./pages/activities/ActivitiesPage.tsx"));
const AptitudeDetailsPage = lazy(() => import("./pages/rulesets/details/entities/AptitudeDetailsPage.tsx"));
/**
 * One-shot per browser-tab: probe /auth/me at most once even if the visitor bounces between auth-only routes while
 * unauth. Memoizing a Promise (rather than a boolean "started" flag) keeps strict-mode's double-effect honest — each
 * mount awaits the same probe and attaches its own .finally, so the surviving mount's callback fires after the first
 * cleanup cancels its peer.
 */
let authProbe: Promise<void> | null = null;
const CampaignCharacterPage = lazy(() => import("./pages/campaigns/CampaignCharacterPage.tsx"));
const CampaignDetailsPage = lazy(() => import("./pages/campaigns/details/CampaignDetailsPage.tsx"));
const CampaignInvitePage = lazy(() => import("./pages/campaign-invite/CampaignInvitePage.tsx"));
const CampaignsPage = lazy(() => import("./pages/campaigns/CampaignsPage.tsx"));
const CharacterContributorInvitePage = lazy(
  () => import("./pages/character-contributor-invite/CharacterContributorInvitePage.tsx"),
);
const CharacterDetailsPage = lazy(() => import("./pages/characters/details/CharacterDetailsPage.tsx"));
const CharactersPage = lazy(() => import("./pages/characters/CharactersPage.tsx"));
const ClassDetailsPage = lazy(() => import("./pages/rulesets/details/classes/ClassDetailsPage.tsx"));
const CustomizationPage = lazy(() => import("./pages/rulesets/customization/CustomizationPage.tsx"));
const DemoExpiredPage = lazy(() => import("./pages/demo-expired/DemoExpiredPage.tsx"));
const ForgotPasswordPage = lazy(() => import("./pages/auth/ForgotPasswordPage.tsx"));
const LanguageDetailsPage = lazy(() => import("./pages/rulesets/details/entities/LanguageDetailsPage.tsx"));
const LegalPage = lazy(() => import("./pages/legal/LegalPage.tsx"));
const MechanicDetailsPage = lazy(() => import("./pages/rulesets/details/entities/MechanicDetailsPage.tsx"));
const NotificationsPage = lazy(() => import("./pages/notifications/NotificationsPage.tsx"));
const ProfilePage = lazy(() => import("./pages/profile/ProfilePage.tsx"));
const queryClient = createQueryClient();
const ResetPasswordPage = lazy(() => import("./pages/auth/ResetPasswordPage.tsx"));
const RulesetContributorInvitePage = lazy(
  () => import("./pages/ruleset-contributor-invite/RulesetContributorInvitePage.tsx"),
);
const RulesetDetailsPage = lazy(() => import("./pages/rulesets/details/RulesetDetailsPage.tsx"));
const RulesetsPage = lazy(() => import("./pages/rulesets/RulesetsPage.tsx"));
const SaveDetailsPage = lazy(() => import("./pages/rulesets/details/entities/SaveDetailsPage.tsx"));
const SettingsPage = lazy(() => import("./pages/settings/SettingsPage.tsx"));
const SharedCharacterPage = lazy(() => import("./pages/shared/SharedCharacterPage.tsx"));
const SignUpPage = lazy(() => import("./pages/auth/SignUpPage.tsx"));

const SkillDetailsPage = lazy(() => import("./pages/rulesets/details/entities/SkillDetailsPage.tsx"));

const VerifyEmailPage = lazy(() => import("./pages/auth/VerifyEmailPage.tsx"));

function AppRoutes() {
  return (
    <Routes>
      <Route element={<AuthLayoutRoute />}>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/sign-up" element={<SignUpPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
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
          <Route path="rulesets/:id/languages/:languageId" element={<LanguageDetailsPage />} />
          <Route path="rulesets/:id/skills/:skillId" element={<SkillDetailsPage />} />
          <Route path="rulesets/:id/saves/:saveId" element={<SaveDetailsPage />} />
          <Route path="rulesets/:id/mechanics/:mechanicId" element={<MechanicDetailsPage />} />
          <Route path="rulesets/:id/aptitudes/:aptitudeId" element={<AptitudeDetailsPage />} />
          <Route path="rulesets/:id/abilities/:abilityId" element={<AbilityDetailsPage />} />

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
  if (isDemoExpired()) return <Navigate to="/demo-expired" replace />;

  // Back to the page once signed in, unless the user signed out of it
  const target = location.pathname + location.search;
  const redirectParam = target !== "/" && !signedOutByUser ? `?redirect=${encodeURIComponent(target)}` : "";
  return <Navigate to={`/sign-in${redirectParam}`} replace />;
}

export default function App() {
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
