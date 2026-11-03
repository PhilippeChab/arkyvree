import { Box, Container, Skeleton, Stack, Typography } from "@mui/material";
import { type ReactNode } from "react";

import { DiceSpinner, Panel } from "@/client/src/components/common/index.ts";
import {
  ANIMATIONS,
  DURATION,
  EASING,
  fadeIn,
  fadeInUpSx,
  PREFERS_REDUCED_MOTION,
} from "@/client/src/theme/animations.ts";

interface SectionProps {
  children: ReactNode;
  index: number;
}

function Section({ index, children }: SectionProps) {
  return (
    <Panel spacing={2} sx={fadeInUpSx(index)}>
      {children}
    </Panel>
  );
}

export function CharacterDetailSkeleton() {
  return (
    <Container
      sx={{
        animation: `${fadeIn} ${DURATION.slow}ms ${EASING.standard}`,
        [PREFERS_REDUCED_MOTION]: { animation: "none" },
      }}
    >
      <Stack spacing={2}>
        {/* The rolling die, over its pulsing line */}
        <Stack sx={{ alignItems: "center", py: 4 }}>
          <DiceSpinner size="large" />
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              animation: ANIMATIONS.pulse,
              [PREFERS_REDUCED_MOTION]: { animation: "none", opacity: 0.6 },
            }}
          >
            Loading character sheet…
          </Typography>
        </Stack>
        {/* The sheet's sections, in their order */}
        <Stack spacing={3}>
          <Section index={0}>
            <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
              <Skeleton variant="circular" width={40} height={40} />
              <Skeleton variant="text" width="40%" height={36} />
            </Stack>
          </Section>

          <Section index={1}>
            <Skeleton variant="text" width="30%" height={32} />
            <Stack direction="row" sx={{ flexWrap: "wrap", columnGap: 4, rowGap: 2 }}>
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} variant="rounded" width={160} height={40} />
              ))}
            </Stack>
          </Section>

          <Section index={2}>
            <Skeleton variant="text" width="20%" height={28} />
            <Stack direction="row" sx={{ flexWrap: "wrap", columnGap: 4, rowGap: 2 }}>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} variant="rounded" sx={{ width: { xs: 70, sm: 90 }, height: { xs: 70, sm: 90 } }} />
              ))}
            </Stack>
          </Section>

          <Section index={3}>
            <Skeleton variant="text" width="25%" height={28} />
            <Stack spacing={1.5}>
              <Skeleton variant="rounded" height={24} width="80%" />
              <Skeleton variant="rounded" height={24} width="65%" />
              <Skeleton variant="rounded" height={24} width="70%" />
            </Stack>
          </Section>

          <Section index={4}>
            <Skeleton variant="text" width="15%" height={28} />
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "1fr 1fr",
                  md: "1fr 1fr 1fr",
                },
                gap: 1,
              }}
            >
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} variant="text" height={24} />
              ))}
            </Box>
          </Section>

          <Section index={5}>
            <Skeleton variant="text" width="15%" height={28} />
            <Stack spacing={1}>
              <Skeleton variant="rounded" height={20} width="55%" />
              <Skeleton variant="rounded" height={20} width="40%" />
              <Skeleton variant="rounded" height={20} width="50%" />
            </Stack>
          </Section>
        </Stack>
      </Stack>
    </Container>
  );
}
