import {
  Backdrop,
  Box,
  Button,
  DialogContent,
  MobileStepper,
  Link as MuiLink,
  Paper,
  Popper,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import type { Instance } from "@popperjs/core";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { Modal } from "@/client/src/components/common/index.ts";
import { CampaignsIcon, CharactersIcon, HelpIcon, RulesetsIcon } from "@/client/src/components/icons/index.ts";
import type { SvgIconComponent } from "@/client/src/components/icons/index.ts";
import { DURATION, EASING, fadeInUp, prefersReducedMotion } from "@/client/src/lib/animations.ts";
import { externalLinks } from "@/client/src/lib/externalLinks.ts";
import { brandGold, brandGoldTint } from "@/client/src/theme/brandGold.ts";
import { glow, iconGlow } from "@/client/src/theme/shadows.ts";

interface OnboardingPopperProps {
  anchorEl: HTMLElement;
  onClose: () => void;
  children: ReactNode;
}

interface OnboardingProps {
  open: boolean;
  onClose: () => void;
  activeStep: number;
  onStepChange: (step: number) => void;
  anchorEl: HTMLElement | null;
  isMobile: boolean;
}

interface OnboardingStep {
  icon: SvgIconComponent | null;
  logo?: boolean;
  title: string;
  description: string;
  tooltip?: string;
  mode: "dialog" | "popper";
}

const SIDEBAR_TRANSITION_MS = 380;

const steps: OnboardingStep[] = [
  {
    icon: null,
    logo: true,
    title: "Welcome to Arkyvree",
    description: "A programmable ruleset engine for tabletop RPGs. Build characters and run campaigns on top.",
    mode: "dialog",
  },
  {
    icon: RulesetsIcon,
    title: "Rulesets",
    description:
      "The foundation — browse base and community rulesets, fork a base ruleset to create your own, and customize rules to fit your table.",
    tooltip:
      "Forking creates your own editable copy of a base ruleset — it inherits all entities and only copies what you change. Extensions let you subscribe to sourcebook content packages that add new feats, items, classes, and more.",
    mode: "popper",
  },
  {
    icon: CharactersIcon,
    title: "Characters",
    description: "Create characters using any ruleset — build sheets with stats, feats, equipment, and more.",
    mode: "popper",
  },
  {
    icon: CampaignsIcon,
    title: "Campaigns",
    description: "Organize your games — create campaigns, invite players, and manage characters together.",
    mode: "popper",
  },
  {
    icon: HelpIcon,
    title: "Learn More",
    description: "Want to dive deeper? The {faq} covers rulesets, forking, the customization system, and more.",
    mode: "dialog",
  },
];

/**
 * The steps beside the sidebar, shown once its expansion, which entering popper mode starts, has finished: it mounts as
 * the mode starts, so each entry waits for its transition. Between steps it moves to the new anchor.
 */
function OnboardingPopper({ anchorEl, onClose, children }: OnboardingPopperProps) {
  const popperRef = useRef<Instance>(null);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (entered) {
      popperRef.current?.update();
      return;
    }
    const timer = setTimeout(() => setEntered(true), SIDEBAR_TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [anchorEl, entered]);

  if (!entered) return null;

  return (
    <>
      <Backdrop open sx={{ zIndex: (t) => t.zIndex.drawer + 2 }} onClick={onClose} />
      <Popper
        open
        popperRef={popperRef}
        anchorEl={anchorEl}
        placement="right-start"
        sx={{ zIndex: (t) => t.zIndex.drawer + 3 }}
        modifiers={[{ name: "offset", options: { offset: [0, 16] } }]}
      >
        <Paper elevation={8} sx={{ width: 360, position: "relative" }}>
          {/* Arrow pointing left */}
          <Box
            sx={{
              position: "absolute",
              left: -8,
              top: 20,
              width: 0,
              height: 0,
              borderTop: 8,
              borderBottom: 8,
              borderRight: 8,
              borderColor: "transparent",
              borderRightColor: "background.paper",
            }}
          />
          {children}
        </Paper>
      </Popper>
    </>
  );
}

export function Onboarding({ open, onClose, activeStep, onStepChange, anchorEl, isMobile }: OnboardingProps) {
  const theme = useTheme();
  const darkMode = theme.palette.mode === "dark";

  const gold = brandGold(darkMode);
  const goldFaint = brandGoldTint(darkMode, darkMode ? 0.12 : 0.1);

  const step = steps[activeStep];
  const isLastStep = activeStep === steps.length - 1;
  const effectiveMode = isMobile || !anchorEl ? "dialog" : "popper";

  const handleNext = () => {
    if (isLastStep) {
      onClose();
    } else {
      onStepChange(activeStep + 1);
    }
  };

  const handleBack = () => {
    onStepChange(activeStep - 1);
  };

  const handleViewFaq = () => {
    onClose();
    window.open(externalLinks.help, "_blank", "noopener,noreferrer");
  };

  if (!open) return null;

  const gradientBar = (
    <Box
      sx={{
        height: 6,
        background: `linear-gradient(90deg, ${theme.palette.primary.main}, ${gold}, ${theme.palette.secondary.main})`,
      }}
    />
  );

  const stepContent = (
    <Stack
      sx={{
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        py: effectiveMode === "dialog" ? { xs: 4, sm: 6 } : 3,
        px: effectiveMode === "dialog" ? { xs: 3, sm: 5 } : 3,
        minHeight: effectiveMode === "dialog" ? { xs: "auto", sm: 380 } : "auto",
      }}
    >
      <Stack
        key={activeStep}
        spacing={2}
        sx={{
          alignItems: "center",
          animation: `${fadeInUp} ${DURATION.normal}ms ${EASING.decelerate} both`,
          [prefersReducedMotion]: { animation: "none" },
        }}
      >
        {/* Icon circle */}
        <Stack direction="row" sx={{ position: "relative", alignItems: "center", justifyContent: "center" }}>
          <Box
            sx={{
              position: "absolute",
              width: effectiveMode === "dialog" ? 140 : 100,
              height: effectiveMode === "dialog" ? 140 : 100,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${goldFaint} 0%, transparent 70%)`,
              pointerEvents: "none",
            }}
          />
          <Stack
            direction="row"
            sx={{
              width: effectiveMode === "dialog" ? 88 : 64,
              height: effectiveMode === "dialog" ? 88 : 64,
              borderRadius: "50%",
              alignItems: "center",
              justifyContent: "center",
              background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
              boxShadow: glow(gold),
              position: "relative",
            }}
          >
            {step.logo ? (
              <Box
                component="img"
                src="/pwa-512x512.png"
                alt=""
                sx={{
                  width: effectiveMode === "dialog" ? 48 : 34,
                  height: effectiveMode === "dialog" ? 48 : 34,
                  filter: iconGlow(brandGold(false)),
                }}
              />
            ) : step.icon ? (
              <step.icon
                fontSize={effectiveMode === "dialog" ? "hero" : "large"}
                sx={{
                  color: "common.white",
                  filter: (theme) => iconGlow(theme.palette.common.black),
                }}
              />
            ) : null}
          </Stack>
        </Stack>

        <Typography id="onboarding-step-title" component="h2" variant="h5">
          {step.title}
        </Typography>

        <Box
          sx={{
            width: 60,
            height: 2,
            background: `linear-gradient(90deg, transparent, ${gold}, transparent)`,
          }}
        />

        <Typography
          variant={effectiveMode === "popper" ? "body2" : "body1"}
          sx={{
            color: "text.secondary",
            maxWidth: effectiveMode === "dialog" ? 400 : 300,
          }}
        >
          {step.description.includes("{faq}")
            ? step.description.split("{faq}").map((part, i) => (
                <span key={i}>
                  {part}
                  {i === 0 && (
                    <MuiLink
                      component="button"
                      onClick={handleViewFaq}
                      sx={{ fontSize: "inherit", verticalAlign: "baseline" }}
                    >
                      FAQ
                    </MuiLink>
                  )}
                </span>
              ))
            : step.description}
        </Typography>

        {step.tooltip && (
          <Tooltip describeChild title={step.tooltip} placement="top">
            <Stack
              direction="row"
              spacing={0.5}
              sx={{
                typography: "body2",
                display: "inline-flex",
                alignItems: "center",
                color: gold,
                cursor: "help",
              }}
            >
              <HelpIcon fontSize="compact" />
              <Typography variant="caption" sx={{ color: "inherit", fontWeight: "fontWeightMedium" }}>
                Forking & Extensions
              </Typography>
            </Stack>
          </Tooltip>
        )}
      </Stack>
    </Stack>
  );

  const stepperDots = (
    <MobileStepper
      variant="dots"
      steps={steps.length}
      position="static"
      activeStep={activeStep}
      sx={{
        justifyContent: "center",
        background: "transparent",
        pb: 0,
        "& .MuiMobileStepper-dot": { mx: 0.5 },
        "& .MuiMobileStepper-dotActive": { backgroundColor: gold },
      }}
      backButton={null}
      nextButton={null}
    />
  );

  const navButtons = (
    <Stack direction="row" sx={{ alignItems: "center", px: 3, pb: 3, pt: 2 }}>
      <Button onClick={onClose} color="inherit" sx={{ opacity: 0.7 }}>
        Skip
      </Button>
      <Box sx={{ flex: 1 }} />
      {activeStep > 0 && (
        <Button onClick={handleBack} color="inherit">
          Back
        </Button>
      )}
      <Button onClick={handleNext} variant="contained">
        {isLastStep ? "Get Started" : "Next"}
      </Button>
    </Stack>
  );

  if (effectiveMode === "dialog" || !anchorEl) {
    return (
      <Modal open onClose={onClose} aria-labelledby="onboarding-step-title">
        {gradientBar}
        <DialogContent sx={{ p: 0 }}>{stepContent}</DialogContent>
        {stepperDots}
        {navButtons}
      </Modal>
    );
  }

  return (
    <OnboardingPopper anchorEl={anchorEl} onClose={onClose}>
      {gradientBar}
      {stepContent}
      {stepperDots}
      {navButtons}
    </OnboardingPopper>
  );
}
