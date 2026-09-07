import { BlankState } from "@/client/src/components/common/index.ts";
import { ExpandLess as ExpandLessIcon, ExpandMore as ExpandMoreIcon } from "@mui/icons-material";
import {
  Box,
  Collapse,
  IconButton,
  Link as MuiLink,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { Link } from "react-router-dom";

type FeatLike = {
  id?: string;
  name: string;
  description?: string | null;
  stackable?: boolean;
};

interface FeatsSectionProps {
  classes: Record<string, {
    levels?: Array<{
      feats?: FeatLike[];
    }>;
  }>;
  virtualFeats?: Array<{
    id: string;
    name: string;
    description?: string | null;
    stackable: boolean;
  }>;
  rulesetId?: string;
  renderFeatExtra?: (feat: FeatLike) => React.ReactNode;
}

export function FeatsSection({ classes, virtualFeats, rulesetId, renderFeatExtra }: FeatsSectionProps) {

  const allFeats = classes
    ? Object.values(classes).flatMap((klass) =>
      (klass.levels || []).flatMap((level) => level.feats || [])
    )
    : [];

  // Group feats by name
  const groupedFeats = allFeats.reduce((acc, feat) => {
    if (!acc[feat.name]) {
      acc[feat.name] = [];
    }
    acc[feat.name].push(feat);
    return acc;
  }, {} as Record<string, typeof allFeats>);

  const renderFeatName = (feat: { id?: string; name: string }, suffix?: string) => {
    const featLink = rulesetId && feat.id ? `/rulesets/${rulesetId}/feats/${feat.id}/customization` : undefined;
    const label = suffix ? `${feat.name} ${suffix}` : feat.name;
    return featLink
      ? <MuiLink component={Link} to={featLink} target="_blank" underline="hover" sx={{ color: "primary.main" }}>{label}</MuiLink>
      : label;
  };

  const featElements = Object.values(groupedFeats).flatMap((featGroup, groupIndex) => {
    const feat = featGroup[0];
    const count = featGroup.length;

    if (feat.stackable && count > 1) {
      return (
        <FeatRow
          key={`${feat.name}-${groupIndex}`}
          name={renderFeatName(feat, `(x${count})`)}
          label={`${feat.name} (x${count})`}
          description={feat.description}
          extra={renderFeatExtra?.(feat)}
        />
      );
    }

    return featGroup.map((featInstance, instanceIndex) => (
      <FeatRow
        key={`${featInstance.name}-${groupIndex}-${instanceIndex}`}
        name={renderFeatName(featInstance)}
        label={featInstance.name}
        description={featInstance.description}
        extra={renderFeatExtra?.(featInstance)}
      />
    ));
  });

  const hasVirtual = (virtualFeats || []).length > 0;

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography sx={{ fontWeight: 600, color: "primary.main", mb: 3, typography: { xs: "h6", sm: "h5" } }}>
        Feats & Special Abilities
      </Typography>
      {featElements.length > 0 || hasVirtual
        ? (
          <Stack spacing={3}>
            {featElements}
            {hasVirtual && <GrantedFeatsSection feats={virtualFeats!} rulesetId={rulesetId} />}
          </Stack>
        )
        : (
          <BlankState title="No feats or special abilities available" />
        )}
    </Paper>
  );
}

function FeatRow({
  name,
  label,
  description,
  extra,
}: {
  name: React.ReactNode;
  label: string;
  description?: string | null;
  extra?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const hasExtra = extra != null && extra !== false;

  return (
    <Box sx={{ borderLeft: "4px solid", borderColor: "primary.main", pl: 2 }}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Typography sx={{ fontWeight: 600, color: "primary.main", typography: { xs: "body1", sm: "h6" } }}>
          {name}
        </Typography>
        {hasExtra && (
          <IconButton
            size="small"
            onClick={() => setOpen((p) => !p)}
            sx={{ p: 0 }}
            aria-label={open ? `Hide ${label} details` : `Show ${label} details`}
            aria-expanded={open}
          >
            {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        )}
      </Stack>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
        {description || "—"}
      </Typography>
      {hasExtra && (
        <Collapse in={open} timeout="auto" unmountOnExit>
          {extra}
        </Collapse>
      )}
    </Box>
  );
}

function GrantedFeatsSection({ feats, rulesetId }: { feats: NonNullable<FeatsSectionProps["virtualFeats"]>; rulesetId?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Box>
      <Box
        onClick={() => setOpen((prev) => !prev)}
        sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", mb: 2 }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Granted ({feats.length})
        </Typography>
        <IconButton
          size="small"
          sx={{ p: 0 }}
          aria-label={open ? "Hide granted feats" : "Show granted feats"}
          aria-expanded={open}
        >
          {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      </Box>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <Stack spacing={3}>
          {feats.map((feat) => {
            const featLink = rulesetId && feat.id ? `/rulesets/${rulesetId}/feats/${feat.id}/customization` : undefined;
            return (
              <Box
                key={feat.id}
                sx={{ borderLeft: "4px solid", borderColor: "primary.main", pl: 2 }}
              >
                <Typography sx={{ fontWeight: 600, color: "primary.main", typography: { xs: "body1", sm: "h6" } }}>
                  {featLink
                    ? <MuiLink component={Link} to={featLink} target="_blank" underline="hover" sx={{ color: "primary.main" }}>{feat.name}</MuiLink>
                    : feat.name
                  }
                </Typography>
                <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
                  {feat.description || "—"}
                </Typography>
              </Box>
            );
          })}
        </Stack>
      </Collapse>
    </Box>
  );
}
