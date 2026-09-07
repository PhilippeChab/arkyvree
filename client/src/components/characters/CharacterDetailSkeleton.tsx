import { EASING, fadeInUpSx, prefersReducedMotion, pulse } from "@/client/src/lib/animations.ts";
import { DiceSpinner } from "@/client/src/components/common/index.ts";
import { Box, Container, Paper, Skeleton, Stack, Typography } from "@mui/material";

function Section({
  index,
  children,
}: {
  index: number;
  children: React.ReactNode;
}) {
  return (
    <Paper sx={{ p: { xs: 2, sm: 3 }, ...fadeInUpSx(index) }}>{children}</Paper>
  );
}

export function CharacterDetailSkeleton() {
  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      {/* Themed header with pulsing icon */}
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          py: 4,
          mb: 2,
        }}
      >
        <DiceSpinner size="large" />
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            animation: `${pulse} 2s ${EASING.standard} infinite`,
            [prefersReducedMotion]: { animation: "none", opacity: 0.6 },
          }}
        >
          Loading character sheet...
        </Typography>
      </Box>
      <Stack spacing={3}>
        {/* Header bar */}
        <Section index={0}>
          <Stack direction="row" spacing={2} sx={{
            alignItems: "center"
          }}>
            <Skeleton variant="circular" width={40} height={40} />
            <Skeleton variant="text" width="40%" height={36} />
          </Stack>
        </Section>

        {/* Identity section */}
        <Section index={1}>
          <Skeleton variant="text" width="30%" height={32} sx={{ mb: 2 }} />
          <Stack
            direction="row"
            spacing={2}
            sx={{ flexWrap: "wrap", gap: 2 }}
          >
            {[1, 2, 3, 4].map((i) => (
              <Skeleton
                key={i}
                variant="rounded"
                width={160}
                height={40}
              />
            ))}
          </Stack>
        </Section>

        {/* Ability scores — 6 blocks */}
        <Section index={2}>
          <Skeleton variant="text" width="20%" height={28} sx={{ mb: 2 }} />
          <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", gap: 2 }}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton
                key={i}
                variant="rounded"
                sx={{ width: { xs: 70, sm: 90 }, height: { xs: 70, sm: 90 } }}
              />
            ))}
          </Stack>
        </Section>

        {/* Combat & saves */}
        <Section index={3}>
          <Skeleton variant="text" width="25%" height={28} sx={{ mb: 2 }} />
          <Stack spacing={1.5}>
            <Skeleton variant="rounded" height={24} width="80%" />
            <Skeleton variant="rounded" height={24} width="65%" />
            <Skeleton variant="rounded" height={24} width="70%" />
          </Stack>
        </Section>

        {/* Skills grid */}
        <Section index={4}>
          <Skeleton variant="text" width="15%" height={28} sx={{ mb: 2 }} />
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

        {/* Feats */}
        <Section index={5}>
          <Skeleton variant="text" width="15%" height={28} sx={{ mb: 2 }} />
          <Stack spacing={1}>
            <Skeleton variant="rounded" height={20} width="55%" />
            <Skeleton variant="rounded" height={20} width="40%" />
            <Skeleton variant="rounded" height={20} width="50%" />
          </Stack>
        </Section>
      </Stack>
    </Container>
  );
}
