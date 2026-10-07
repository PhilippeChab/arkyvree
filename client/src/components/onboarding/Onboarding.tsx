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
  Typography,
} from "@mui/material";
import type { Instance } from "@popperjs/core";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { HelpLabel, Modal } from "@/client/src/components/common/index.ts";
import {
  CampaignIcon,
  CharacterIcon,
  HelpIcon,
  RulesetIcon,
  type SvgIconComponent,
} from "@/client/src/components/icons/index.ts";
import { EXTERNAL_LINKS } from "@/client/src/lib/externalLinks.ts";
import { DURATION, EASING, fadeInUp, PREFERS_REDUCED_MOTION } from "@/client/src/theme/animations.ts";

interface OnboardingPopperProps {
  anchorEl: HTMLElement;
  children: ReactNode;
  onClose: () => void;
}

interface OnboardingProps {
  activeStep: number;
  anchorEl: HTMLElement | null;
  isMobile: boolean;
  onClose: () => void;
  onStepChange: (step: number) => void;
  open: boolean;
}

interface OnboardingStep {
  description: string;
  icon: SvgIconComponent | null;
  logo?: boolean;
  mode: "dialog" | "popper";
  title: string;
  tooltip?: string;
}

const SIDEBAR_TRANSITION_MS = 380;

const STEPS: OnboardingStep[] = [
  {
    icon: null,
    logo: true,
    title: "Welcome to Arkyvree",
    description: "A programmable ruleset engine for tabletop RPGs. Build characters and run campaigns on top.",
    mode: "dialog",
  },
  {
    icon: RulesetIcon,
    title: "Rulesets",
    description:
      "The foundation — browse base and community rulesets, fork a base ruleset to create your own, and customize rules to fit your table.",
    tooltip:
      "Forking creates your own editable copy of a base ruleset — it inherits all entities and only copies what you change. Extensions let you subscribe to sourcebook content packages that add new feats, items, classes, and more.",
    mode: "popper",
  },
  {
    icon: CharacterIcon,
    title: "Characters",
    description: "Create characters using any ruleset — build sheets with stats, feats, equipment, and more.",
    mode: "popper",
  },
  {
    icon: CampaignIcon,
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
      <Backdrop open sx={{ zIndex: (theme) => theme.zIndex.drawer + 2 }} onClick={onClose} />
      <Popper
        open
        popperRef={popperRef}
        anchorEl={anchorEl}
        placement="right-start"
        sx={{ zIndex: (theme) => theme.zIndex.drawer + 3 }}
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
              borderTopColor: "transparent",
              borderBottomColor: "transparent",
              borderRightColor: "background.paper",
              filter: (theme) => theme.dropShadows.popperArrow,
            }}
          />
          {children}
        </Paper>
      </Popper>
    </>
  );
}

export function Onboarding({ open, onClose, activeStep, onStepChange, anchorEl, isMobile }: OnboardingProps) {
  const step = STEPS[activeStep];
  const isLastStep = activeStep === STEPS.length - 1;
  const effectiveMode = isMobile || !anchorEl ? "dialog" : "popper";

  const handleNext = () => {
    if (isLastStep) onClose();
    else onStepChange(activeStep + 1);
  };

  const handleBack = () => {
    onStepChange(activeStep - 1);
  };

  const gradientBar = (
    <Box
      sx={{
        height: 6,
        background: (theme) =>
          `linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.gold.main}, ${theme.palette.secondary.main})`,
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
        spacing={3}
        sx={{
          alignItems: "center",
          animation: `${fadeInUp} ${DURATION.normal}ms ${EASING.decelerate} both`,
          [PREFERS_REDUCED_MOTION]: { animation: "none" },
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
              background: (theme) => `radial-gradient(circle, ${theme.palette.gold.faint} 0%, transparent 70%)`,
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
              background: (theme) =>
                `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
              boxShadow: (theme) => theme.boxShadows.onboardingIcon,
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
                  filter: (theme) => theme.dropShadows.onboardingLogo,
                }}
              />
            ) : step.icon ? (
              <step.icon
                sx={{
                  fontSize: effectiveMode === "dialog" ? 44 : 32,
                  color: "common.white",
                  filter: (theme) => theme.dropShadows.onboardingIcon,
                }}
              />
            ) : null}
          </Stack>
        </Stack>

        <Stack spacing={2} sx={{ alignItems: "center" }}>
          <Typography
            id="onboarding-step-title"
            variant={effectiveMode === "dialog" ? "h5" : "h6"}
            sx={{ fontWeight: 700, letterSpacing: "0.02em" }}
          >
            {step.title}
          </Typography>

          <Box
            sx={{
              width: 60,
              height: 2,
              background: (theme) => `linear-gradient(90deg, transparent, ${theme.palette.gold.main}, transparent)`,
            }}
          />

          <Typography
            variant="body1"
            sx={{
              color: "text.secondary",
              maxWidth: effectiveMode === "dialog" ? 400 : 300,
              lineHeight: 1.7,
              fontSize: effectiveMode === "popper" ? "0.9rem" : undefined,
            }}
          >
            {step.description.includes("{faq}")
              ? step.description.split("{faq}").map((part, i) => (
                  <span key={i}>
                    {part}
                    {i === 0 && (
                      <MuiLink
                        href={EXTERNAL_LINKS.help}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={onClose}
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
            <Typography variant="caption" sx={{ color: "gold.main", fontWeight: 500 }}>
              <HelpLabel label="Forking & Extensions" help={step.tooltip} />
            </Typography>
          )}
        </Stack>
      </Stack>
    </Stack>
  );

  const stepperDots = (
    <MobileStepper
      variant="dots"
      steps={STEPS.length}
      position="static"
      activeStep={activeStep}
      sx={{
        justifyContent: "center",
        background: "transparent",
        pb: 0,
        "& .MuiMobileStepper-dot": { mx: 0.5 },
        "& .MuiMobileStepper-dotActive": { bgcolor: "gold.main" },
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
      <Box sx={{ flexGrow: 1 }} />
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
      <Modal open={open} onClose={onClose} aria-labelledby="onboarding-step-title">
        {gradientBar}
        <DialogContent sx={{ p: 0 }}>{stepContent}</DialogContent>
        {stepperDots}
        {navButtons}
      </Modal>
    );
  }

  // The tour's popper, not a dialog, goes with it
  if (!open) return null;
  return (
    <OnboardingPopper anchorEl={anchorEl} onClose={onClose}>
      {gradientBar}
      {stepContent}
      {stepperDots}
      {navButtons}
    </OnboardingPopper>
  );
}
