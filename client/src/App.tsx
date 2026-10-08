import { CssBaseline } from "@mui/material";
import { QueryClientProvider } from "@tanstack/react-query";
import { lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthLayoutRoute, PrivateRoute } from "./components/auth/index.ts";
import { ErrorBoundary } from "./components/common/index.ts";
import { Layout, PublicLayout } from "./components/layout/index.ts";
import { CustomThemeProvider } from "./contexts/CustomThemeProvider.tsx";
import { SnackbarProvider } from "./contexts/SnackbarProvider.tsx";
import { WebSocketProvider } from "./contexts/WebSocketProvider.tsx";
import { createQueryClient } from "./lib/queryClient.ts";
import SignInPage from "./pages/auth/SignInPage.tsx";
import DashboardPage from "./pages/dashboard/DashboardPage.tsx";

const AbilityDetailsPage = lazy(() => import("./pages/rulesets/details/entities/AbilityDetailsPage.tsx"));
const ActivitiesPage = lazy(() => import("./pages/activities/ActivitiesPage.tsx"));
const AptitudeDetailsPage = lazy(() => import("./pages/rulesets/details/entities/AptitudeDetailsPage.tsx"));
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

          {/* A simple entity's page: one without customizations */}
          <Route path="rulesets/:id/languages/:languageId" element={<LanguageDetailsPage />} />
          <Route path="rulesets/:id/skills/:skillId" element={<SkillDetailsPage />} />
          <Route path="rulesets/:id/saves/:saveId" element={<SaveDetailsPage />} />
          <Route path="rulesets/:id/mechanics/:mechanicId" element={<MechanicDetailsPage />} />
          <Route path="rulesets/:id/aptitudes/:aptitudeId" element={<AptitudeDetailsPage />} />
          <Route path="rulesets/:id/abilities/:abilityId" element={<AbilityDetailsPage />} />

          <Route path="rulesets/:id/classes/:classId" element={<ClassDetailsPage />} />
          <Route path="rulesets/:id/classes/:classId/:section" element={<ClassDetailsPage />} />

          {/* A customizable entity's page: its details and its customizations' tabs */}
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
