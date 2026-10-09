import { Container, Stack, Typography } from "@mui/material";

import { CardTitle, OptionToggle, PageHeader, PageTransition, Panel } from "@/client/src/components/common/index.ts";
import { DarkModeIcon, LightModeIcon, SettingsBrightnessIcon } from "@/client/src/components/icons/index.ts";
import { type ThemeMode } from "@/client/src/contexts/themeContext.ts";
import { useThemeMode } from "@/client/src/contexts/useThemeMode.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";

const THEME_MODE_OPTIONS = [
  { value: "light", label: "Light", icon: LightModeIcon },
  { value: "dark", label: "Dark", icon: DarkModeIcon },
  { value: "system", label: "System", icon: SettingsBrightnessIcon },
] as const;

export default function SettingsPage() {
  usePageTitle("Settings");
  const { themeMode, setThemeMode } = useThemeMode();

  return (
    <PageTransition>
      <Container maxWidth="lg">
        <Stack spacing={4}>
          <PageHeader title="Settings" subtitle="Customize your experience" />

          <Panel>
            <Stack spacing={1}>
              <CardTitle>Theme</CardTitle>
              <Stack spacing={3}>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  Choose how Arkyvree looks to you. Select a single theme, or sync with your system settings.
                </Typography>

                <OptionToggle<ThemeMode>
                  label="Mode"
                  options={THEME_MODE_OPTIONS}
                  value={themeMode}
                  onChange={setThemeMode}
                />
              </Stack>
            </Stack>
          </Panel>
        </Stack>
      </Container>
    </PageTransition>
  );
}
