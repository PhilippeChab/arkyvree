import { PageHeader, PageTransition } from "@/client/src/components/common/index.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { type ThemeMode, useTheme } from "@/client/src/contexts/ThemeContext.tsx";
import { DarkMode, LightMode, SettingsBrightness } from "@mui/icons-material";
import {
  Card,
  CardContent,
  Container,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";

const themeModeOptions: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <LightMode /> },
  { value: "dark", label: "Dark", icon: <DarkMode /> },
  { value: "system", label: "System", icon: <SettingsBrightness /> },
];

export default function SettingsPage() {
  usePageTitle("Settings");
  const { themeMode, setThemeMode } = useTheme();

  return (
    <PageTransition>
      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 } }}>
        <PageHeader title="Settings" subtitle="Customize your experience" />

        <Card>
          <CardContent sx={{ p: { xs: 2, sm: 4 } }}>
            <Typography component="h2" sx={{ fontWeight: 700, mb: 1, typography: { xs: "h6", sm: "h5" } }}>
              Theme
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
                mb: 3
              }}>
              Choose how Arkyvree looks to you. Select a single theme, or sync
              with your system settings.
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
              {themeModeOptions.map((option) => (
                <ToggleButton key={option.value} value={option.value}>
                  {option.icon}
                  {option.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </CardContent>
        </Card>
      </Container>
    </PageTransition>
  );
}
