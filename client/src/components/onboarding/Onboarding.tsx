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

import { DialogFooter, GoldDivider, HelpLabel, Modal } from "@/client/src/components/common/index.ts";
import { EXTERNAL_LINKS } from "@/client/src/lib/externalLinks.ts";
import { DURATION, EASING, fadeInUp, PREFERS_REDUCED_MOTION } from "@/client/src/theme/animations.ts";

import { ONBOARDING_STEPS } from "./onboardingSteps.ts";

interface OnboardingPopperProps {
  anchorEl: HTMLElement;
  children: ReactNode;
  onClose: () => void;
}

interface OnboardingProps {
  activeStep: number;
  /** The sidebar's item its step points at, beside which it shows (`sidebarId`); none shows it as a dialog. */
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onStepChange: (step: number) => void;
  open: boolean;
}

/** How long the sidebar takes to expand: its width's transition, and its labels' fade a beat behind it (`Layout`) */
const SIDEBAR_EXPANSION_MS = DURATION.deliberate + DURATION.beat;

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
    const timer = setTimeout(() => setEntered(true), SIDEBAR_EXPANSION_MS);
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

export function Onboarding({ open, onClose, activeStep, onStepChange, anchorEl }: OnboardingProps) {
  const step = ONBOARDING_STEPS[activeStep];
  const isLastStep = activeStep === ONBOARDING_STEPS.length - 1;
  const effectiveMode = anchorEl ? "popper" : "dialog";

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
            component="h2"
            variant={effectiveMode === "dialog" ? "h5" : "h6"}
            sx={{ fontWeight: 700, letterSpacing: "0.02em" }}
          >
            {step.title}
          </Typography>

          <GoldDivider sx={{ width: 60, height: 2 }} />

          <Typography
            variant="body1"
            sx={{
              color: "text.secondary",
              maxWidth: effectiveMode === "dialog" ? 400 : 300,
              lineHeight: 1.7,
              fontSize: effectiveMode === "popper" ? "0.9rem" : undefined,
            }}
          >
            {step.description.includes("{help}")
              ? step.description.split("{help}").map((part, i) => (
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
                        Help
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
      steps={ONBOARDING_STEPS.length}
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
    <DialogFooter
      onCancel={onClose}
      cancelLabel="Skip"
      action={{ label: isLastStep ? "Get Started" : "Next", onClick: handleNext }}
    >
      {activeStep > 0 && <Button onClick={handleBack}>Back</Button>}
    </DialogFooter>
  );

  if (!anchorEl) {
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
