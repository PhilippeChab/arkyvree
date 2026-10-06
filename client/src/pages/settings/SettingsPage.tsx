import { ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";

import { PageBody, PageHeader, Section } from "@/client/src/components/common/index.ts";
import { DarkModeIcon, LightModeIcon, SystemModeIcon } from "@/client/src/components/icons/index.ts";
import { useTheme } from "@/client/src/contexts/useTheme.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import type { ThemeMode } from "@/client/src/stores/themeMode.ts";

const themeModeOptions: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <LightModeIcon /> },
  { value: "dark", label: "Dark", icon: <DarkModeIcon /> },
  { value: "system", label: "System", icon: <SystemModeIcon /> },
];

export default function SettingsPage() {
  usePageTitle("Settings");
  const { themeMode, setThemeMode } = useTheme();

  return (
    <PageBody width="lg">
      <PageHeader title="Settings" subtitle="Customize your experience" />

      <Section title="Theme">
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
              fontWeight: "fontWeightMedium",
            },
          }}
        >
          {themeModeOptions.map((option) => (
            <ToggleButton key={option.value} value={option.value}>
              {option.icon}
              {option.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Section>
    </PageBody>
  );
}
