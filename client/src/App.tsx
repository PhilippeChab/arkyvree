import { CssBaseline } from "@mui/material";
import { QueryClientProvider } from "@tanstack/react-query";
import { lazy } from "react";
import { createBrowserRouter, createRoutesFromElements, Navigate, Route, RouterProvider } from "react-router-dom";

import { AuthLayoutRoute, PrivateRoute } from "./components/auth/index.ts";
import { ErrorBoundary, Layout, PublicLayout, RouteError } from "./components/layout/index.ts";
import { SnackbarProvider } from "./contexts/SnackbarProvider.tsx";
import { ThemeModeProvider } from "./contexts/ThemeModeProvider.tsx";
import { WebSocketProvider } from "./contexts/WebSocketProvider.tsx";
import { createQueryClient } from "./lib/queryClient.ts";
import SignInPage from "./pages/auth/SignInPage.tsx";
import DashboardPage from "./pages/dashboard/DashboardPage.tsx";

const ActivitiesPage = lazy(() => import("./pages/activities/ActivitiesPage.tsx"));
const CampaignCharacterPage = lazy(() => import("./pages/campaigns/CampaignCharacterPage.tsx"));
const CampaignDetailsPage = lazy(() => import("./pages/campaigns/details/CampaignDetailsPage.tsx"));
const CampaignsPage = lazy(() => import("./pages/campaigns/CampaignsPage.tsx"));
const CharacterDetailsPage = lazy(() => import("./pages/characters/details/CharacterDetailsPage.tsx"));
const CharactersPage = lazy(() => import("./pages/characters/CharactersPage.tsx"));
const ClassDetailsPage = lazy(() => import("./pages/rulesets/details/classes/ClassDetailsPage.tsx"));
const CustomizationPage = lazy(() => import("./pages/rulesets/customization/CustomizationPage.tsx"));
const DemoExpiredPage = lazy(() => import("./pages/demo-expired/DemoExpiredPage.tsx"));
const EntityPage = lazy(() => import("./pages/rulesets/details/entities/EntityPage.tsx"));
const ForgotPasswordPage = lazy(() => import("./pages/auth/ForgotPasswordPage.tsx"));
const InvitePage = lazy(() => import("./pages/invites/InvitePage.tsx"));
const LegalPage = lazy(() => import("./pages/legal/LegalPage.tsx"));
const NotificationsPage = lazy(() => import("./pages/notifications/NotificationsPage.tsx"));
const ProfilePage = lazy(() => import("./pages/profile/ProfilePage.tsx"));
const queryClient = createQueryClient();
const ResetPasswordPage = lazy(() => import("./pages/auth/ResetPasswordPage.tsx"));
const RulesetDetailsPage = lazy(() => import("./pages/rulesets/details/RulesetDetailsPage.tsx"));
const RulesetsPage = lazy(() => import("./pages/rulesets/RulesetsPage.tsx"));
const SettingsPage = lazy(() => import("./pages/settings/SettingsPage.tsx"));
const SharedCharacterPage = lazy(() => import("./pages/share/SharedCharacterPage.tsx"));
const SignUpPage = lazy(() => import("./pages/auth/SignUpPage.tsx"));
const VerifyEmailPage = lazy(() => import("./pages/auth/VerifyEmailPage.tsx"));

/**
 * The app's pages, under a data router: a page can then hold the user back from leaving it (`useBlocker`, through
 * `useLeaveGuard`), which a class's unsaved progression does.
 */
const router = createBrowserRouter(
  createRoutesFromElements(
    <Route errorElement={<RouteError />}>
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

          <Route path="rulesets/:id/classes/:classId" element={<ClassDetailsPage />} />
          <Route path="rulesets/:id/classes/:classId/:section" element={<ClassDetailsPage />} />

          {/* A page kind's entity's page, by its kind's URL segment: one without customizations (a language, a skill) */}
          <Route path="rulesets/:id/:section/:entityId" element={<EntityPage />} />

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
          {/* An invite's page, whatever its kind: the email's link names the invite (a contributor's is its row) */}
          <Route path="campaign-invite/:inviteId" element={<InvitePage kind="campaign" />} />
          <Route path="ruleset-contributor-invite/:inviteId" element={<InvitePage kind="rulesetContributor" />} />
          <Route path="character-contributor-invite/:inviteId" element={<InvitePage kind="characterContributor" />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Route>,
  ),
);

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeModeProvider>
          <SnackbarProvider>
            <WebSocketProvider>
              <CssBaseline enableColorScheme />
              <RouterProvider router={router} />
            </WebSocketProvider>
          </SnackbarProvider>
        </ThemeModeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
