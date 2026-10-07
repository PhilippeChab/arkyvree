import { Card, CardContent, Container, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { type ReactNode } from "react";

import { CardTitle, PageHeader, PageTransition } from "@/client/src/components/common/index.ts";
import { DarkModeIcon, LightModeIcon, SettingsBrightnessIcon } from "@/client/src/components/icons/index.ts";
import { type ThemeMode } from "@/client/src/contexts/themeContext.ts";
import { useThemeMode } from "@/client/src/contexts/useThemeMode.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";

const THEME_MODE_OPTIONS: { icon: ReactNode; label: string; value: ThemeMode }[] = [
  { value: "light", label: "Light", icon: <LightModeIcon /> },
  { value: "dark", label: "Dark", icon: <DarkModeIcon /> },
  { value: "system", label: "System", icon: <SettingsBrightnessIcon /> },
];

export default function SettingsPage() {
  usePageTitle("Settings");
  const { themeMode, setThemeMode } = useThemeMode();

  return (
    <PageTransition>
      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 } }}>
        <Stack spacing={4}>
          <PageHeader title="Settings" subtitle="Customize your experience" />

          <Card>
            <CardContent sx={{ p: { xs: 2, sm: 4 } }}>
              <Stack spacing={1}>
                <CardTitle>Theme</CardTitle>
                <Stack spacing={3} sx={{ alignItems: "flex-start" }}>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    Choose how Arkyvree looks to you. Select a single theme, or sync with your system settings.
                  </Typography>

                  <ToggleButtonGroup
                    value={themeMode}
                    exclusive
                    onChange={(_, value: ThemeMode | null) => {
                      if (value) setThemeMode(value);
                    }}
                    sx={{
                      "& .MuiToggleButton-root": {
                        px: { xs: 1.5, sm: 3 },
                        py: { xs: 1, sm: 1.5 },
                        gap: 1,
                        textTransform: "none",
                        fontWeight: 500,
                      },
                    }}
                  >
                    {THEME_MODE_OPTIONS.map((option) => (
                      <ToggleButton key={option.value} value={option.value}>
                        {option.icon}
                        {option.label}
                      </ToggleButton>
                    ))}
                  </ToggleButtonGroup>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      </Container>
    </PageTransition>
  );
}
