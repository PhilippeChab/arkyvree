import {
  DetailPageHeader,
  DiceSpinner,
  FaqHelpIcon,
  Modal,
  PageTransition,
  SectionTabs,
  type SectionTab,
} from "@/client/src/components/common/index.ts";
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
import { usePageTitle } from "@/client/src/hooks/index.ts";
import {
  useRulesetOperations,
  useRulesetPermissions,
} from "@/client/src/pages/rulesets/hooks/index.ts";
import { externalLinks } from "@/client/src/lib/externalLinks.ts";
import { rulesetDetailQuery } from "@/client/src/lib/queries.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import {
  AccessibilityNew as ClassesIcon,
  FitnessCenter as AbilitiesIcon,
  Archive as ArchiveIcon,
  CompareArrows as CompareArrowsIcon,
  Bolt as PowersIcon,
  CheckCircle as PublishedIcon,
  Construction as ItemsIcon,
  ContentCopy as ForkIcon,
  Edit as EditIcon,
  EditNote as DraftIcon,
  Extension as ExtensionIcon,
  Gavel as MechanicsIcon,
  Lock as PrivateIcon,
  Public as PublicIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  People as RacesIcon,
  Psychology as SkillsIcon,
  Publish as PublishIcon,
  Spoke as FeatsIcon,
  Unarchive as UnarchiveIcon,
  Shield as SavesIcon,
  Stars as AptitudesIcon,
  Translate as LanguagesIcon,
  Group as ContributorsIcon,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Popover,
  Tooltip,
  Typography,
} from "@mui/material";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from "react-router-dom";
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
import { getSections } from "./sectionFactory.ts";
import { prefetchSection, type RulesetSection } from "./sectionQueries.ts";


function HelpLabel({ label, help }: { label: string; help: string }) {
  return (
    <Box component="span" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      {label}
      <FaqHelpIcon text={help} />
    </Box>
  );
}

function getStatusChip(status: "Draft" | "Published" | "Archived") {
  switch (status) {
    case "Draft":
      return (
        <Tooltip title="Fully editable — add, edit, and delete entities. Only visible to you until published.">
          <Chip
            icon={<DraftIcon />}
            label="Draft"
            size="medium"
            color="info"
            variant="filled"
            sx={{ fontWeight: 600 }}
          />
        </Tooltip>
      );
    case "Published":
      return (
        <Tooltip title="Available for others to use and fork. You can still add, edit, and delete entities — characters that depend on a deletion will block it.">
          <Chip
            icon={<PublishedIcon />}
            label="Published"
            size="medium"
            color="success"
            variant="filled"
            sx={{ fontWeight: 600 }}
          />
        </Tooltip>
      );
    case "Archived":
      return (
        <Tooltip title="Read-only. Can be un-archived later.">
          <Chip
            icon={<ArchiveIcon />}
            label="Archived"
            size="medium"
            sx={{
              fontWeight: 600,
              bgcolor: "grey.400",
              color: "grey.700",
              "& .MuiChip-icon": { color: "grey.600" },
            }}
          />
        </Tooltip>
      );
  }
}

export default function RulesetDetailsPage() {
  const { id = "", section } = useParams<{ id: string; section?: string }>();
  const navigate = useNavigate();
  const currentUserId = useAuthStore((state) => state.user?.id);

  const {
    data: ruleset,
    isLoading,
    error,
  } = useQuery({
    ...rulesetDetailQuery(id),
    placeholderData: keepPreviousData,
  });

  usePageTitle(ruleset?.name);

  const { data: subscribedExtensions } = useQuery({
    queryKey: [...queryKeys.rulesets.detail(id), "extensions"],
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
  const setChildOnly = useCallback((value: boolean) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) {
        next.set("childOnly", "true");
      } else {
        next.set("childOnly", "false");
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [extensionsAnchor, setExtensionsAnchor] = useState<null | HTMLElement>(null);
  if (!subscribedExtensions?.length && extensionsAnchor !== null) {
    setExtensionsAnchor(null);
  }
  const { isOwner, isContributor, canEditRuleset, canPublish } = useRulesetPermissions(ruleset);
  const isFork = !!ruleset?.rulesetId && !isExtension;
  const showContributorsMenu = (isOwner || isContributor) && ruleset?.status !== "Archived";
  const hasMenuItems = isOwner || canEditRuleset || (!!ruleset && ruleset.status === "Published" && !isExtension) || isFork || showContributorsMenu;

  const baseRules = ruleset?.baseRules;
  const [contributorsDialogOpen, setContributorsDialogOpen] = useState(false);
  type TabConfig = SectionTab<RulesetSection> & { component: (props: { ruleset: NonNullable<typeof ruleset>; childOnly: boolean; onChildOnlyChange: (value: boolean) => void }) => React.ReactNode };
  const tabConfig = useMemo((): TabConfig[] => {
    const sections = getSections(baseRules ?? "Dungeons & Dragons: 3.5");
    return [
      { key: "races", label: "Races", icon: RacesIcon, component: RacesSection },
      { key: "languages", label: "Languages", icon: LanguagesIcon, component: LanguagesSection },
      { key: "skills", label: "Skills", icon: SkillsIcon, component: sections.SkillsSection },
      { key: "feats", label: "Feats", icon: FeatsIcon, component: FeatsSection },
      { key: "powers", label: sections.labels.powers, icon: PowersIcon, component: sections.PowersSection },
      { key: "items", label: "Items", icon: ItemsIcon, component: sections.ItemsSection },
      { key: "aptitudes", label: <HelpLabel label="Aptitudes" help="Pools of choosable options at certain class levels (e.g., Fighter Bonus Feats, Rogue Special Abilities)." />, icon: AptitudesIcon, component: AptitudesSection },
      { key: "classes", label: "Classes", icon: ClassesIcon, component: sections.ClassesSection },
      { key: "saves", label: "Saves", icon: SavesIcon, component: SavesSection },
      { key: "abilities", label: "Abilities", icon: AbilitiesIcon, component: AbilitiesSection },
      { key: "mechanics", label: <HelpLabel label="Mechanics" help="Free-form rule entries for base game mechanics the app doesn't enforce (e.g., trip, disarm, grapple). Use them to document or override situational rules for your table." />, icon: MechanicsIcon, component: MechanicsSection },
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
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: 400,
          }}
        >
          <DiceSpinner />
        </Box>
      </Container>
    );
  }

  if (error || !ruleset) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Paper sx={{ p: { xs: 2, sm: 4 }, textAlign: "center" }}>
          <Typography variant="h5" color="error" gutterBottom>
            Failed to load ruleset
          </Typography>
          <Button
            variant="contained"
            onClick={() => navigate("/rulesets")}
            sx={{ mt: 2 }}
          >
            Back to Rulesets
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <PageTransition>
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <DetailPageHeader
          title={ruleset.name}
          titleAdornment={ruleset.isStarrable && (
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
          )}
          onBack={() => navigate("/rulesets")}
          onMenuOpen={hasMenuItems ? (e) => setAnchorEl(e.currentTarget) : undefined}
          chips={(
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
                label={`${subscribedExtensions.length} ${subscribedExtensions.length === 1 ? "extension" : "extensions"}`}
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
                      onDelete={isOwner ? (e: React.MouseEvent) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleUnsubscribe(ruleset.id, ext.extensionId, ext.extensionName);
                      } : undefined}
                    />
                  ))}
                </Box>
              </Popover>
            </>
          )}
            </>
          )}
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
              <strong>This ruleset is archived and read-only.</strong>{" "}
              You can view all content but cannot make changes.
              {currentUserId && " Fork it to create an editable copy."}
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
          <currentTab.component ruleset={ruleset} childOnly={childOnly} onChildOnlyChange={setChildOnly} />
        </Box>

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
          slotProps={{ paper: { sx: { minWidth: 200 } } }}
        >
          {ruleset.status === "Published" && !isExtension && !isFork && (
            <MenuItem
              onClick={() => {
                setAnchorEl(null);
                handleFork({ ...ruleset, rulesetName: undefined });
              }}
            >
              <ListItemIcon><ForkIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Fork" secondary="Create your own editable copy" />
            </MenuItem>
          )}
          {!!ruleset.rulesetId && [
            <MenuItem
              key="local-changes"
              onClick={() => {
                setAnchorEl(null);
                setOverridesDialogOpen(true);
              }}
            >
              <ListItemIcon><CompareArrowsIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Local changes" secondary="View added, modified, and deleted entities" />
            </MenuItem>,
          ]}
          {isOwner && ruleset.rulesetId && ruleset.status !== "Archived" && !ruleset.isUsedAsExtension && !isExtension && (
            <MenuItem
              key="subscribe-extension"
              onClick={() => {
                setAnchorEl(null);
                handleSubscribe({ ...ruleset, rulesetName: undefined });
              }}
            >
              <ListItemIcon><ExtensionIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Subscribe" secondary="Add content from a sourcebook" />
            </MenuItem>
          )}
          {showContributorsMenu && (
            <MenuItem
              onClick={() => {
                setAnchorEl(null);
                setContributorsDialogOpen(true);
              }}
            >
              <ListItemIcon><ContributorsIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Contributors" secondary="Admin, Editor, Viewer" />
            </MenuItem>
          )}
          {isOwner && ruleset.rulesetId && ruleset.status !== "Archived" && [
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
              <Typography variant="caption" sx={{
                color: "text.secondary"
              }}>
                Learn more in Help Center
              </Typography>
            </MenuItem>,
          ]}
          {canEditRuleset && ruleset.status !== "Archived" && [
            <MenuItem
              key="edit"
              onClick={() => {
                setAnchorEl(null);
                handleEdit({ ...ruleset, rulesetName: undefined });
              }}
            >
              <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Edit" />
            </MenuItem>,
            canPublish && ruleset.status === "Draft" && (
              <MenuItem
                key="publish"
                onClick={() => {
                  setAnchorEl(null);
                  handlePublish({ ...ruleset, rulesetName: undefined });
                }}
                sx={{ color: "success.main" }}
              >
                <ListItemIcon sx={{ color: "inherit" }}><PublishIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Publish" />
              </MenuItem>
            ),
            <MenuItem
              key="archive"
              onClick={() => {
                setAnchorEl(null);
                handleArchive({ ...ruleset, rulesetName: undefined });
              }}
              sx={{ color: "warning.main" }}
            >
              <ListItemIcon sx={{ color: "inherit" }}><ArchiveIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Archive" />
            </MenuItem>,
          ]}
          {isOwner && ruleset.status === "Archived" && (
            <MenuItem
              onClick={() => {
                setAnchorEl(null);
                if (id) {
                  unarchiveMutation.mutate(id);
                }
              }}
              sx={{ color: "success.main" }}
            >
              <ListItemIcon sx={{ color: "inherit" }}><UnarchiveIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Unarchive" />
            </MenuItem>
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
          canBeExtension={!!selectedRuleset?.rulesetId && selectedRuleset.userId !== null && selectedRuleset.extensionRulesetIds.length === 0}
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
          canBeExtension={!!selectedRuleset?.rulesetId && selectedRuleset.userId !== null && selectedRuleset.extensionRulesetIds.length === 0}
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

        <Modal
          open={contributorsDialogOpen}
          onClose={() => setContributorsDialogOpen(false)}
          maxWidth="md"
        >
          <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <ContributorsIcon /> Contributors
          </DialogTitle>
          <DialogContent>
            <ContributorsSection ruleset={ruleset} onLeave={() => navigate("/rulesets")} />
          </DialogContent>
        </Modal>
      </Container>
    </PageTransition>
  );
}
