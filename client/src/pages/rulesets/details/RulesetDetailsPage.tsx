import { faqTooltip, Modal, PageTransition, DiceSpinner } from "@/client/src/components/common/index.ts";
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
import { usePageTitle, usePrefetch } from "@/client/src/hooks/index.ts";
import {
  useRulesetOperations,
  useRulesetPermissions,
} from "@/client/src/pages/rulesets/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import {
  AccessibilityNew as ClassesIcon,
  FitnessCenter as AbilitiesIcon,
  Archive as ArchiveIcon,
  CompareArrows as CompareArrowsIcon,
  ArrowBack,
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
  MoreVert as MoreVertIcon,
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
  HelpOutlined as HelpIcon,
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
  Tab,
  Tabs,
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

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  if (value !== index) return null;

  return (
    <div
      role="tabpanel"
      id={`ruleset-tabpanel-${index}`}
      aria-labelledby={`ruleset-tab-${index}`}
      {...other}
    >
      <Box sx={{ py: 3 }}>{children}</Box>
    </div>
  );
}

type TabSection =
  | "races"
  | "languages"
  | "skills"
  | "feats"
  | "powers"
  | "items"
  | "classes"
  | "aptitudes"
  | "saves"
  | "abilities"
  | "mechanics";

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
  const { id, section } = useParams<{ id: string; section?: string }>();
  const navigate = useNavigate();
  const currentUserId = useAuthStore((state) => state.user?.id);

  const {
    data: ruleset,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.rulesets.detail(id!),
    queryFn: async () => {
      if (!id) throw new Error("No ruleset ID provided");
      const response = await rpc.api.rulesets[":id"].$get({ param: { id } });
      if (!response.ok) throw new Error("Failed to fetch ruleset");
      return response.json();
    },
    placeholderData: keepPreviousData,
  });

  usePageTitle(ruleset?.name);

  const { data: subscribedExtensions } = useQuery({
    queryKey: [...queryKeys.rulesets.detail(id!), "extensions"],
    queryFn: async () => {
      if (!id) throw new Error("No ruleset ID provided");
      const response = await rpc.api.rulesets[":id"].extensions.$get({ param: { id } });
      if (!response.ok) throw new Error("Failed to fetch extensions");
      return response.json();
    },
    enabled: !!ruleset?.rulesetId,
  });

  // Prefetch parent ruleset on hover/focus of the fork chip
  const parentId = ruleset?.rulesetId;
  const parentQueryFn = useCallback(async () => {
    const response = await rpc.api.rulesets[":id"].$get({ param: { id: parentId! } });
    if (!response.ok) throw new Error("Failed to fetch ruleset");
    return response.json();
  }, [parentId]);
  const parentPrefetch = usePrefetch(queryKeys.rulesets.detail(parentId!), parentQueryFn);

  const queryClient = useQueryClient();

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
  useEffect(() => {
    if (!subscribedExtensions?.length) setExtensionsAnchor(null);
  }, [subscribedExtensions?.length]);
  const { isOwner, isContributor, canEditRuleset, canPublish } = useRulesetPermissions(ruleset);
  const isFork = !!ruleset?.rulesetId && !isExtension;
  const showContributorsMenu = (isOwner || isContributor) && ruleset?.status !== "Archived";
  const hasMenuItems = isOwner || canEditRuleset || (!!ruleset && ruleset.status === "Published" && !isExtension) || isFork || showContributorsMenu;

  const baseRules = ruleset?.baseRules;
  const [contributorsDialogOpen, setContributorsDialogOpen] = useState(false);
  type TabConfig = { key: TabSection; label: string; icon: React.ElementType; component: (props: { ruleset: NonNullable<typeof ruleset>; childOnly: boolean; onChildOnlyChange: (value: boolean) => void }) => React.ReactNode };
  const tabConfig = useMemo((): TabConfig[] => {
    const sections = getSections(baseRules ?? "Dungeons & Dragons: 3.5");
    return [
      { key: "races", label: "Races", icon: RacesIcon, component: RacesSection },
      { key: "languages", label: "Languages", icon: LanguagesIcon, component: LanguagesSection },
      { key: "skills", label: "Skills", icon: SkillsIcon, component: sections.SkillsSection },
      { key: "feats", label: "Feats", icon: FeatsIcon, component: FeatsSection },
      { key: "powers", label: sections.labels.powers, icon: PowersIcon, component: sections.PowersSection },
      { key: "items", label: "Items", icon: ItemsIcon, component: sections.ItemsSection },
      { key: "aptitudes", label: "Aptitudes", icon: AptitudesIcon, component: AptitudesSection },
      { key: "classes", label: "Classes", icon: ClassesIcon, component: sections.ClassesSection },
      { key: "saves", label: "Saves", icon: SavesIcon, component: SavesSection },
      { key: "abilities", label: "Abilities", icon: AbilitiesIcon, component: AbilitiesSection },
      { key: "mechanics", label: "Mechanics", icon: MechanicsIcon, component: MechanicsSection },
    ];
  }, [baseRules]);

  const tabSections = useMemo(() => tabConfig.map((t) => t.key), [tabConfig]);
  const currentTabValue = useMemo(() => {
    if (!section) return 0;
    const index = tabSections.indexOf(section as TabSection);
    return index >= 0 ? index : 0;
  }, [section, tabSections]);

  const prefetchSection = useCallback((sectionKey: TabSection) => {
    if (!id) return;
    const childOnlyQuery = childOnly ? "true" as const : undefined;
    const makeFn = (fetcher: () => Promise<Response>) => async () => {
      const response = await fetcher();
      if (!response.ok) throw new Error(`Failed to fetch ${sectionKey}`);
      return response.json();
    };
    if (sectionKey === "abilities") {
      queryClient.prefetchQuery({
        queryKey: [...queryKeys.rulesets.section(id, "abilities"), childOnly],
        queryFn: makeFn(() => rpc.api.rulesets[":id"].abilities.$get({ param: { id }, query: { page: "1", limit: "10", childOnly: childOnlyQuery } })),
      });
      return;
    }
    const queryKey = [...queryKeys.rulesets.section(id, sectionKey), "", childOnly];
    const sectionFetchers: Record<Exclude<TabSection, "abilities">, () => Promise<Response>> = {
      saves: () => rpc.api.rulesets[":id"].saves.$get({ param: { id }, query: { page: "1", limit: "10", childOnly: childOnlyQuery } }),
      mechanics: () => rpc.api.rulesets[":id"].mechanics.$get({ param: { id }, query: { page: "1", limit: "10", childOnly: childOnlyQuery } }),
      races: () => rpc.api.rulesets[":id"].races.$get({ param: { id }, query: { page: "1", limit: "10", childOnly: childOnlyQuery } }),
      languages: () => rpc.api.rulesets[":id"].languages.$get({ param: { id }, query: { page: "1", limit: "10", childOnly: childOnlyQuery } }),
      skills: () => rpc.api.rulesets[":id"].skills.$get({ param: { id }, query: { page: "1", limit: "10", childOnly: childOnlyQuery } }),
      feats: () => rpc.api.rulesets[":id"].feats.$get({ param: { id }, query: { page: "1", limit: "10", childOnly: childOnlyQuery } }),
      powers: () => rpc.api.rulesets[":id"].powers.$get({ param: { id }, query: { page: "1", limit: "10", childOnly: childOnlyQuery } }),
      items: () => rpc.api.rulesets[":id"].items.$get({ param: { id }, query: { page: "1", limit: "10", childOnly: childOnlyQuery } }),
      aptitudes: () => rpc.api.rulesets[":id"].aptitudes.$get({ param: { id }, query: { page: "1", limit: "10", childOnly: childOnlyQuery } }),
      classes: () => rpc.api.rulesets[":id"].classes.$get({ param: { id }, query: { page: "1", limit: "10", childOnly: childOnlyQuery } }),
    };
    const fetcher = sectionFetchers[sectionKey as keyof typeof sectionFetchers];
    if (!fetcher) return;
    queryClient.prefetchInfiniteQuery({
      queryKey,
      queryFn: makeFn(fetcher),
      initialPageParam: 1,
    });
  }, [id, childOnly, queryClient]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    const newSection = tabSections[newValue];
    navigate(`/rulesets/${id}/${newSection}`);
  };

  const handleBack = () => {
    navigate("/rulesets");
  };

  // Redirect to races tab if no section specified
  useEffect(() => {
    if (id && (!section || !tabSections.includes(section as TabSection))) {
      navigate(`/rulesets/${id}/races`, { replace: true });
    }
  }, [id, section, navigate, tabSections]);

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
        {/* Header */}
        <Box
          sx={{
            mb: 4,
            display: "flex",
            alignItems: "center",
            py: 2,
            borderBottom: 1,
            borderColor: "divider",
            position: "relative",
          }}
        >
          <IconButton
            onClick={handleBack}
            size="large"
            sx={{
              position: "absolute",
              left: 0,
              "&:hover": {
                bgcolor: "action.hover",
              },
            }}
          >
            <ArrowBack />
          </IconButton>
          {hasMenuItems && (
            <IconButton
              size="large"
              onClick={(e) => setAnchorEl(e.currentTarget)}
              sx={{
                position: "absolute",
                right: 0,
                "&:hover": {
                  bgcolor: "action.hover",
                },
              }}
            >
              <MoreVertIcon />
            </IconButton>
          )}
          <Box
            sx={{
              flexGrow: 1,
              textAlign: "center",
              px: { xs: 5, md: 8 },
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, mb: 1 }}>
              <Typography component="h3" sx={{ fontWeight: 700, typography: { xs: "h4", md: "h3" } }}>
                {ruleset.name}
              </Typography>
              {ruleset.isStarrable && (
                <IconButton
                  onClick={() => toggleStar(ruleset.id, ruleset.isStarred)}
                  size="small"
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
            </Box>
            <Box sx={{ display: "flex", justifyContent: "center", gap: 1, mb: 2, flexWrap: "wrap" }}>
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
                  {...parentPrefetch}
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
            </Box>
            <Typography
              variant="body1"
              sx={{
                color: "text.secondary",
                maxWidth: 600,
                mx: "auto"
              }}>
              {ruleset.description || "Explore the complete rules and content for this game system"}
            </Typography>
            {ruleset.system && ruleset.baseRules === "Dungeons & Dragons: 3.5" && (
              <RulesetLicenseNotice key={ruleset.id} name={ruleset.name} />
            )}
          </Box>
        </Box>

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

        <Box sx={{ borderRadius: 2, bgcolor: "action.hover", p: 1, mb: 4 }}>
          <Tabs
            value={currentTabValue}
            onChange={handleTabChange}
            aria-label="ruleset details tabs"
            variant="scrollable"
            scrollButtons
            allowScrollButtonsMobile
            sx={{
              "& .MuiTabs-indicator": {
                height: 3,
                borderRadius: 1.5,
              },
              "& .MuiTab-root": {
                textTransform: "none",
                fontWeight: 600,
                fontSize: "0.875rem",
                minHeight: 48,
                borderRadius: 1,
                mx: 0.5,
                "&:hover": {
                  bgcolor: "action.hover",
                },
                "&.Mui-selected": {
                  bgcolor: "background.default",
                  boxShadow: 1,
                },
              },
              "& .MuiTabs-scrollButtons": {
                "&.Mui-disabled": {
                  opacity: 0.3,
                },
              },
            }}
          >
            {tabConfig.map((tab) => (
              <Tab
                key={tab.key}
                icon={<tab.icon />}
                label={
                  tab.key === "aptitudes" ? (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      {tab.label}
                      <Tooltip
                        title={faqTooltip(
                          "Pools of choosable options at certain class levels (e.g., Fighter Bonus Feats, Rogue Special Abilities).",
                        )}
                        arrow
                      >
                        <HelpIcon sx={{ fontSize: 16, opacity: 0.6 }} />
                      </Tooltip>
                    </Box>
                  ) : tab.key === "mechanics" ? (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      {tab.label}
                      <Tooltip
                        title={faqTooltip(
                          "Free-form rule entries for base game mechanics the app doesn't enforce (e.g., trip, disarm, grapple). Use them to document or override situational rules for your table.",
                        )}
                        arrow
                      >
                        <HelpIcon sx={{ fontSize: 16, opacity: 0.6 }} />
                      </Tooltip>
                    </Box>
                  ) : (
                    tab.label
                  )
                }
                iconPosition="start"
                onMouseEnter={() => prefetchSection(tab.key)}
              />
            ))}
          </Tabs>
        </Box>

        <Box sx={{ width: "100%" }}>
          {id &&
            tabConfig.map((tab, index) => (
              <TabPanel key={tab.key} value={currentTabValue} index={index}>
                <tab.component ruleset={ruleset} childOnly={childOnly} onChildOnlyChange={setChildOnly} />
              </TabPanel>
            ))}
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
              href="https://arkyvree.featurebase.app/help"
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
