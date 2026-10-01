import {
  FitnessCenter as AbilitiesIcon,
  Stars as AptitudesIcon,
  Archive as ArchiveIcon,
  AccessibilityNew as ClassesIcon,
  CompareArrows as CompareArrowsIcon,
  Group as ContributorsIcon,
  Edit as EditIcon,
  Extension as ExtensionIcon,
  Spoke as FeatsIcon,
  ContentCopy as ForkIcon,
  Construction as ItemsIcon,
  Translate as LanguagesIcon,
  Gavel as MechanicsIcon,
  Bolt as PowersIcon,
  Lock as PrivateIcon,
  Public as PublicIcon,
  Publish as PublishIcon,
  People as RacesIcon,
  Shield as SavesIcon,
  Psychology as SkillsIcon,
  StarBorder as StarBorderIcon,
  Star as StarIcon,
  Unarchive as UnarchiveIcon,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Popover,
  Tooltip,
  Typography,
} from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from "react-router-dom";

import {
  ActionMenuItem,
  DetailPageHeader,
  DiceSpinner,
  FaqHelpIcon,
  Modal,
  PageError,
  PageTransition,
  type SectionTab,
  SectionTabs,
} from "@/client/src/components/common/index.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { externalLinks } from "@/client/src/lib/externalLinks.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import type { RulesetDetail } from "@/client/src/lib/queries.ts";
import { rulesetDetailQuery } from "@/client/src/lib/queries.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { RULESET_STATUS } from "@/client/src/pages/rulesets/components/index.ts";
import {
  ArchiveRulesetDialog,
  EditRulesetDialog,
  ForkRulesetDialog,
  OverridesDialog,
  PublishRulesetDialog,
  RulesetLicenseNotice,
  SubscribeExtensionDialog,
  UnsubscribeExtensionDialog,
} from "@/client/src/pages/rulesets/details/components/index.ts";
import { useRulesetOperations, useRulesetPermissions } from "@/client/src/pages/rulesets/hooks/index.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { DEFAULT_BASE_RULES } from "@/shared/enums.ts";

import { getSections, type RulesetSectionProps } from "./sectionFactory.ts";
import { prefetchSection, type RulesetSection } from "./sectionQueries.ts";
import {
  AbilitiesSection,
  AptitudesSection,
  ContributorsSection,
  FeatsSection,
  LanguagesSection,
  MechanicsSection,
  RacesSection,
  SavesSection,
} from "./sections/index.ts";

function HelpLabel({ label, help }: { label: string; help: string }) {
  return (
    <Box component="span" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      {label}
      <FaqHelpIcon text={help} />
    </Box>
  );
}

function getStatusChip(status: RulesetDetail["status"]) {
  const { icon: StatusIcon, color, tooltip } = RULESET_STATUS[status];
  return (
    <Tooltip describeChild title={tooltip}>
      <Chip
        icon={<StatusIcon />}
        label={status}
        size="medium"
        color={color}
        variant="filled"
        sx={
          status === "Archived"
            ? { fontWeight: 600, bgcolor: "grey.400", color: "grey.700", "& .MuiChip-icon": { color: "grey.600" } }
            : { fontWeight: 600 }
        }
      />
    </Tooltip>
  );
}

export default function RulesetDetailsPage() {
  const { id = "", section } = useParams<{ id: string; section?: string }>();
  const navigate = useNavigate();

  // No placeholder data: opening another ruleset (a fork or extension chip) must not show,
  // or act on, the previous one while it loads.
  const { data: ruleset, isLoading, error } = useQuery(rulesetDetailQuery(id));

  usePageTitle(ruleset?.name);

  const { data: subscribedExtensions } = useQuery({
    queryKey: queryKeys.rulesets.extensions(id),
    queryFn: () => parseResponse(rpc.api.rulesets[":id"].extensions.$get({ param: { id } })),
    enabled: !!ruleset?.rulesetId,
  });

  const queryClient = useQueryClient();
  // Warm the parent ruleset while the pointer is on the "Forked from" chip.
  const prefetchParent = () => {
    if (ruleset?.rulesetId) void queryClient.prefetchQuery(rulesetDetailQuery(ruleset.rulesetId));
  };

  const {
    selectedRuleset,
    editDialogOpen,
    setEditDialogOpen,
    forkDialogOpen,
    setForkDialogOpen,
    archiveDialogOpen,
    setArchiveDialogOpen,
    publishDialogOpen,
    setPublishDialogOpen,
    subscribeDialogOpen,
    setSubscribeDialogOpen,
    unsubscribeDialogOpen,
    setUnsubscribeDialogOpen,
    unsubscribeTarget,
    editForm,
    forkForm,
    updateMutation,
    forkMutation,
    archiveMutation,
    unarchiveMutation,
    publishMutation,
    subscribeMutation,
    unsubscribeMutation,
    handleEdit,
    handleFork,
    handleArchive,
    handlePublish,
    handleSubscribe,
    handleUnsubscribe,
    confirmFork,
    confirmSubscribe,
    confirmUnsubscribe,
    toggleStar,
  } = useRulesetOperations();

  const isExtension = !!ruleset && ruleset.kind === "extension";
  const [overridesDialogOpen, setOverridesDialogOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const childOnly = searchParams.has("childOnly") ? searchParams.get("childOnly") === "true" : isExtension;
  const setChildOnly = useCallback(
    (value: boolean) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) {
            next.set("childOnly", "true");
          } else {
            next.set("childOnly", "false");
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const closeMenuAnd = (then: () => void) => () => {
    setAnchorEl(null);
    then();
  };
  const [extensionsAnchor, setExtensionsAnchor] = useState<null | HTMLElement>(null);
  if (!subscribedExtensions?.length && extensionsAnchor !== null) {
    setExtensionsAnchor(null);
  }
  const { isOwner, isContributor, canEditRuleset, canPublish } = useRulesetPermissions(ruleset);
  const isFork = !!ruleset?.rulesetId && !isExtension;
  const showContributorsMenu = (isOwner || isContributor) && ruleset?.status !== "Archived";
  const hasMenuItems =
    isOwner ||
    canEditRuleset ||
    (!!ruleset && ruleset.status === "Published" && !isExtension) ||
    isFork ||
    showContributorsMenu;

  const baseRules = ruleset?.baseRules;
  const [contributorsDialogOpen, setContributorsDialogOpen] = useState(false);
  type TabConfig = SectionTab<RulesetSection> & { component: (props: RulesetSectionProps) => React.ReactNode };
  const tabConfig = useMemo((): TabConfig[] => {
    const sections = getSections(baseRules ?? DEFAULT_BASE_RULES);
    return [
      { key: "races", label: "Races", icon: RacesIcon, component: RacesSection },
      { key: "languages", label: "Languages", icon: LanguagesIcon, component: LanguagesSection },
      { key: "skills", label: "Skills", icon: SkillsIcon, component: sections.SkillsSection },
      { key: "feats", label: "Feats", icon: FeatsIcon, component: FeatsSection },
      { key: "powers", label: sections.labels.powers, icon: PowersIcon, component: sections.PowersSection },
      { key: "items", label: "Items", icon: ItemsIcon, component: sections.ItemsSection },
      {
        key: "aptitudes",
        label: (
          <HelpLabel
            label="Aptitudes"
            help="Pools of choosable options at certain class levels (e.g., Fighter Bonus Feats, Rogue Special Abilities)."
          />
        ),
        icon: AptitudesIcon,
        component: AptitudesSection,
      },
      { key: "classes", label: "Classes", icon: ClassesIcon, component: sections.ClassesSection },
      { key: "saves", label: "Saves", icon: SavesIcon, component: SavesSection },
      { key: "abilities", label: "Abilities", icon: AbilitiesIcon, component: AbilitiesSection },
      {
        key: "mechanics",
        label: (
          <HelpLabel
            label="Mechanics"
            help="Free-form rule entries for base game mechanics the app doesn't enforce (e.g., trip, disarm, grapple). Use them to document or override situational rules for your table."
          />
        ),
        icon: MechanicsIcon,
        component: MechanicsSection,
      },
    ];
  }, [baseRules]);

  const currentTab = tabConfig.find((tab) => tab.key === section) ?? tabConfig[0];

  // Normalize the URL to a known tab.
  useEffect(() => {
    if (id && !tabConfig.some((tab) => tab.key === section)) {
      navigate(`/rulesets/${id}/races`, { replace: true });
    }
  }, [id, section, navigate, tabConfig]);

  if (isLoading) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <DiceSpinner sx={{ minHeight: 400 }} />
      </Container>
    );
  }

  // A failed background refetch keeps the loaded page (and any edits in progress) on screen.
  if (!ruleset) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <PageError
          message={loadFailureMessage("Ruleset", error)}
          backLabel="Back to Rulesets"
          onBack={() => navigate("/rulesets")}
        />
      </Container>
    );
  }

  return (
    <PageTransition>
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <DetailPageHeader
          title={ruleset.name}
          titleAdornment={
            ruleset.isStarrable && (
              <IconButton
                onClick={() => toggleStar(ruleset.id, ruleset.isStarred)}
                size="small"
                aria-label={ruleset.isStarred ? "Unstar ruleset" : "Star ruleset"}
                sx={{
                  flexShrink: 0,
                  p: 0,
                  color: ruleset.isStarred ? "warning.main" : "action.disabled",
                  "&:hover": { color: "warning.main", backgroundColor: "transparent" },
                }}
              >
                {ruleset.isStarred ? <StarIcon fontSize="medium" /> : <StarBorderIcon fontSize="medium" />}
              </IconButton>
            )
          }
          onBack={() => navigate("/rulesets")}
          onMenuOpen={hasMenuItems ? (e) => setAnchorEl(e.currentTarget) : undefined}
          chips={
            <>
              {getStatusChip(ruleset.status)}
              <Chip
                icon={ruleset.private ? <PrivateIcon /> : <PublicIcon />}
                label={ruleset.private ? "Private" : "Public"}
                size="medium"
                color={ruleset.private ? "warning" : "success"}
                variant="filled"
                sx={{ fontWeight: 600 }}
              />
              {isExtension && (
                <Chip
                  icon={<ExtensionIcon />}
                  label="Extension"
                  size="medium"
                  color="secondary"
                  variant="filled"
                  sx={{ fontWeight: 600 }}
                />
              )}
              {ruleset.rulesetId && ruleset.rulesetName && (
                <Chip
                  icon={<ForkIcon />}
                  label={`Forked from ${ruleset.rulesetName}`}
                  size="medium"
                  color="info"
                  variant="outlined"
                  component={RouterLink}
                  to={`/rulesets/${ruleset.rulesetId}`}
                  clickable
                  sx={{ fontWeight: 500 }}
                  onMouseEnter={prefetchParent}
                  onFocus={prefetchParent}
                />
              )}
              {subscribedExtensions && subscribedExtensions.length > 0 && (
                <>
                  <Chip
                    icon={<ExtensionIcon />}
                    label={formatCount(subscribedExtensions.length, "extension")}
                    size="medium"
                    color={subscribedExtensions.some((ext) => ext.updateAvailable) ? "warning" : "default"}
                    variant="outlined"
                    clickable
                    onClick={(e) => setExtensionsAnchor(e.currentTarget)}
                    sx={{ fontWeight: 500 }}
                  />
                  <Popover
                    open={Boolean(extensionsAnchor)}
                    anchorEl={extensionsAnchor}
                    onClose={() => setExtensionsAnchor(null)}
                    anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
                    transformOrigin={{ vertical: "top", horizontal: "center" }}
                  >
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1, p: 1.5, maxWidth: 360 }}>
                      {subscribedExtensions.map((ext) => (
                        <Chip
                          key={ext.extensionId}
                          icon={<ExtensionIcon />}
                          label={ext.extensionName}
                          size="medium"
                          color={ext.updateAvailable ? "warning" : "default"}
                          variant="outlined"
                          component={RouterLink}
                          to={`/rulesets/${ext.extensionId}`}
                          clickable
                          sx={{ fontWeight: 500, justifyContent: "flex-start" }}
                          onDelete={
                            isOwner
                              ? (e: React.MouseEvent) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleUnsubscribe(ruleset.id, ext.extensionId, ext.extensionName);
                                }
                              : undefined
                          }
                        />
                      ))}
                    </Box>
                  </Popover>
                </>
              )}
            </>
          }
          description={ruleset.description || "Explore the complete rules and content for this game system"}
        >
          {ruleset.system && ruleset.baseRules === "Dungeons & Dragons: 3.5" && (
            <RulesetLicenseNotice key={ruleset.id} name={ruleset.name} />
          )}
        </DetailPageHeader>

        {/* Read-Only Banner for Archived Rulesets */}
        {ruleset.status === "Archived" && (
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2">
              <strong>This ruleset is archived and read-only.</strong> You can view all content but cannot make changes.
              {isOwner && " Unarchive it to edit it again."}
            </Typography>
          </Alert>
        )}

        <SectionTabs
          tabs={tabConfig}
          value={currentTab.key}
          onChange={(key) => navigate(`/rulesets/${id}/${key}`)}
          // Changing tab clears the URL's filters, so it opens with the ruleset's default "Local changes".
          onTabHover={(key) => void prefetchSection(queryClient, id, key, isExtension)}
          aria-label="ruleset details tabs"
        />

        <Box role="tabpanel" sx={{ py: 3 }}>
          {/* Keyed by ruleset: a tab's list keeps its previous data while a search loads, never another ruleset's. */}
          <currentTab.component
            key={ruleset.id}
            ruleset={ruleset}
            childOnly={childOnly}
            onChildOnlyChange={setChildOnly}
          />
        </Box>

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
          slotProps={{ paper: { sx: { minWidth: 200 } } }}
        >
          {ruleset.status === "Published" && !isExtension && !isFork && (
            <ActionMenuItem
              icon={ForkIcon}
              label="Fork"
              description="Create your own editable copy"
              onClick={closeMenuAnd(() => handleFork(ruleset))}
            />
          )}
          {!!ruleset.rulesetId && (
            <ActionMenuItem
              icon={CompareArrowsIcon}
              label="Local changes"
              description="View added, modified, and deleted entities"
              onClick={closeMenuAnd(() => setOverridesDialogOpen(true))}
            />
          )}
          {isOwner &&
            ruleset.rulesetId &&
            ruleset.status !== "Archived" &&
            !ruleset.isUsedAsExtension &&
            !isExtension && (
              <ActionMenuItem
                icon={ExtensionIcon}
                label="Subscribe"
                description="Add content from a sourcebook"
                onClick={closeMenuAnd(() => handleSubscribe(ruleset))}
              />
            )}
          {showContributorsMenu && (
            <ActionMenuItem
              icon={ContributorsIcon}
              label="Contributors"
              description="Admin, Editor, Viewer"
              onClick={closeMenuAnd(() => setContributorsDialogOpen(true))}
            />
          )}
          {isOwner &&
            ruleset.rulesetId &&
            ruleset.status !== "Archived" && [
              <Divider key="sync-divider" />,
              <MenuItem
                key="faq-link"
                component="a"
                href={externalLinks.help}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setAnchorEl(null)}
                sx={{ justifyContent: "center" }}
              >
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  Learn more in Help Center
                </Typography>
              </MenuItem>,
            ]}
          {canEditRuleset &&
            ruleset.status !== "Archived" && [
              <ActionMenuItem
                key="edit"
                icon={EditIcon}
                label="Edit"
                onClick={closeMenuAnd(() => handleEdit(ruleset))}
              />,
              canPublish && ruleset.status === "Draft" && (
                <ActionMenuItem
                  key="publish"
                  icon={PublishIcon}
                  label="Publish"
                  intent="positive"
                  onClick={closeMenuAnd(() => handlePublish(ruleset))}
                />
              ),
              <ActionMenuItem
                key="archive"
                icon={ArchiveIcon}
                label="Archive"
                intent="caution"
                onClick={closeMenuAnd(() => handleArchive(ruleset))}
              />,
            ]}
          {isOwner && ruleset.status === "Archived" && (
            <ActionMenuItem
              icon={UnarchiveIcon}
              label="Unarchive"
              intent="positive"
              onClick={closeMenuAnd(() => unarchiveMutation.mutate(ruleset.id))}
            />
          )}
        </Menu>

        <EditRulesetDialog
          open={editDialogOpen}
          onClose={() => setEditDialogOpen(false)}
          form={editForm}
          onSubmit={(data) => {
            if (selectedRuleset) {
              updateMutation.mutate({ id: selectedRuleset.id, data });
            }
          }}
          isLoading={updateMutation.isPending}
          isPublic={selectedRuleset ? !selectedRuleset.private : false}
          canBeExtension={
            !!selectedRuleset?.rulesetId &&
            selectedRuleset.userId !== null &&
            selectedRuleset.extensionRulesetIds.length === 0
          }
        />

        <ArchiveRulesetDialog
          open={archiveDialogOpen}
          onClose={() => setArchiveDialogOpen(false)}
          onConfirm={() => {
            if (selectedRuleset) {
              archiveMutation.mutate(selectedRuleset.id, {
                onSuccess: () => navigate("/rulesets"),
              });
            }
          }}
          isLoading={archiveMutation.isPending}
        />

        <PublishRulesetDialog
          open={publishDialogOpen}
          onClose={() => setPublishDialogOpen(false)}
          onConfirm={(kind) => {
            if (selectedRuleset) {
              publishMutation.mutate({ id: selectedRuleset.id, kind });
            }
          }}
          isLoading={publishMutation.isPending}
          canBeExtension={
            !!selectedRuleset?.rulesetId &&
            selectedRuleset.userId !== null &&
            selectedRuleset.extensionRulesetIds.length === 0
          }
          initialKind={selectedRuleset?.kind ?? "ruleset"}
        />

        <ForkRulesetDialog
          open={forkDialogOpen}
          onClose={() => setForkDialogOpen(false)}
          form={forkForm}
          onSubmit={confirmFork}
          isLoading={forkMutation.isPending}
        />

        {ruleset.rulesetId && (
          <>
            <OverridesDialog
              open={overridesDialogOpen}
              onClose={() => setOverridesDialogOpen(false)}
              rulesetId={ruleset.id}
              canEdit={canEditRuleset}
            />

            <SubscribeExtensionDialog
              open={subscribeDialogOpen}
              onClose={() => setSubscribeDialogOpen(false)}
              onConfirm={confirmSubscribe}
              isLoading={subscribeMutation.isPending}
              subscribedExtensionIds={subscribedExtensions?.map((ext) => ext.extensionId) ?? []}
            />

            <UnsubscribeExtensionDialog
              open={unsubscribeDialogOpen}
              onClose={() => {
                setUnsubscribeDialogOpen(false);
              }}
              onConfirm={confirmUnsubscribe}
              isLoading={unsubscribeMutation.isPending}
              extensionName={unsubscribeTarget?.extensionName ?? ""}
            />
          </>
        )}

        <Modal open={contributorsDialogOpen} onClose={() => setContributorsDialogOpen(false)} maxWidth="md">
          <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <ContributorsIcon /> Contributors
          </DialogTitle>
          <DialogContent>
            <ContributorsSection ruleset={ruleset} onLeave={() => navigate("/rulesets")} />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setContributorsDialogOpen(false)} variant="outlined" color="inherit">
              Close
            </Button>
          </DialogActions>
        </Modal>
      </Container>
    </PageTransition>
  );
}
