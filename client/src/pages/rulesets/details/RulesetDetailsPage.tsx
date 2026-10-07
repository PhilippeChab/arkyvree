import {
  Alert,
  Box,
  Chip,
  Container,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Menu,
  Popover,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type MouseEvent, type ReactNode, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import {
  ActionMenuItem,
  DetailPageHeader,
  DialogFooter,
  HelpLabel,
  LoadError,
  Modal,
  PageError,
  PageLoader,
  PageTransition,
  type SectionTab,
  SectionTabs,
} from "@/client/src/components/common/index.ts";
import {
  AbilitiesIcon,
  AptitudesIcon,
  ArchiveIcon,
  ClassesIcon,
  CompareArrowsIcon,
  EditIcon,
  ExtensionIcon,
  FeatsIcon,
  ForkIcon,
  GroupIcon,
  HelpIcon,
  ItemsIcon,
  LanguagesIcon,
  MechanicsIcon,
  PowersIcon,
  PrivateIcon,
  PublicIcon,
  PublishIcon,
  RacesIcon,
  SavesIcon,
  SkillsIcon,
  StarBorderIcon,
  StarIcon,
  UnarchiveIcon,
} from "@/client/src/components/icons/index.ts";
import { useAnchorMenu, usePageTitle, useSearchParam } from "@/client/src/hooks/index.ts";
import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { EXTERNAL_LINKS } from "@/client/src/lib/externalLinks.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import { type RulesetDetail, rulesetDetailQuery } from "@/client/src/lib/queries.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import { RULESET_STATUS } from "@/client/src/pages/rulesets/components/index.ts";
import { useRulesetOperations, useRulesetPermissions } from "@/client/src/pages/rulesets/hooks/index.ts";
import { DEFAULT_BASE_RULES } from "@/shared/enums.ts";

import {
  ArchiveRulesetDialog,
  EditRulesetDialog,
  ForkRulesetDialog,
  OverridesDialog,
  PublishRulesetDialog,
  RulesetLicenseNotice,
  SubscribeExtensionDialog,
  UnsubscribeExtensionDialog,
} from "./components/index.ts";
import { rulesetExtensionsQuery } from "./rulesetQueries.ts";
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
            ? {
                fontWeight: 600,
                // Muted greys, darker on the dark theme
                bgcolor: (theme) => (theme.palette.mode === "dark" ? "grey.800" : "grey.400"),
                color: (theme) => (theme.palette.mode === "dark" ? "grey.400" : "grey.700"),
                "& .MuiChip-icon": { color: (theme) => (theme.palette.mode === "dark" ? "grey.500" : "grey.600") },
              }
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

  const { data: subscribedExtensions, error: extensionsError } = useQuery(
    rulesetExtensionsQuery(id, ruleset?.rulesetId),
  );

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
    publishKind,
    setPublishKind,
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
  const { value: childOnlyParam, setValue: setChildOnlyParam } = useSearchParam("childOnly");
  const childOnly = childOnlyParam ? childOnlyParam === "true" : isExtension;
  const setChildOnly = (value: boolean) => setChildOnlyParam(value ? "true" : "false");
  const menu = useAnchorMenu();
  const extensionsMenu = useAnchorMenu();
  if (!subscribedExtensions?.length && extensionsMenu.open) extensionsMenu.closeMenu();

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
  type TabConfig = SectionTab<RulesetSection> & { component: (props: RulesetSectionProps) => ReactNode };
  const tabConfig = useMemo((): TabConfig[] => {
    const rules = baseRules ?? DEFAULT_BASE_RULES;
    const sections = getSections(rules);
    return [
      { key: "races", label: "Races", icon: RacesIcon, component: RacesSection },
      { key: "languages", label: "Languages", icon: LanguagesIcon, component: LanguagesSection },
      { key: "skills", label: "Skills", icon: SkillsIcon, component: sections.SkillsSection },
      { key: "feats", label: "Feats", icon: FeatsIcon, component: FeatsSection },
      {
        key: "powers",
        label: entityTypeLabel("powers", rules, true),
        icon: PowersIcon,
        component: sections.PowersSection,
      },
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
  if (id && !tabConfig.some((tab) => tab.key === section)) return <Navigate to={`/rulesets/${id}/races`} replace />;

  if (isLoading) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <PageLoader />
      </Container>
    );
  }

  // A failed background refetch keeps the loaded page (and any edits in progress) on screen.
  if (!ruleset) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <PageError message={loadFailureMessage("Ruleset", error)} backLabel="Back to Rulesets" backTo={"/rulesets"} />
      </Container>
    );
  }

  return (
    <PageTransition>
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Stack spacing={4}>
          <DetailPageHeader
            title={ruleset.name}
            titleAdornment={
              ruleset.isStarrable && (
                <IconButton
                  onClick={() => toggleStar(ruleset.id, ruleset.isStarred)}
                  size="small"
                  aria-label="Star Ruleset"
                  aria-pressed={ruleset.isStarred}
                  sx={{
                    flexShrink: 0,
                    p: 0,
                    color: ruleset.isStarred ? "warning.main" : "action.disabled",
                    "&:hover": { color: "warning.main", bgcolor: "transparent" },
                  }}
                >
                  {ruleset.isStarred ? <StarIcon fontSize="medium" /> : <StarBorderIcon fontSize="medium" />}
                </IconButton>
              )
            }
            backTo={"/rulesets"}
            onMenuOpen={hasMenuItems ? menu.openMenu : undefined}
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
                    component={Link}
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
                      onClick={extensionsMenu.openMenu}
                      sx={{ fontWeight: 500 }}
                    />
                    <Popover
                      open={extensionsMenu.open}
                      anchorEl={extensionsMenu.anchorEl}
                      onClose={extensionsMenu.closeMenu}
                      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
                      transformOrigin={{ vertical: "top", horizontal: "center" }}
                    >
                      <Stack spacing={1} sx={{ p: 1.5, maxWidth: 360 }}>
                        {subscribedExtensions.map((ext) => (
                          <Chip
                            key={ext.extensionId}
                            icon={<ExtensionIcon />}
                            label={ext.extensionName}
                            size="medium"
                            color={ext.updateAvailable ? "warning" : "default"}
                            variant="outlined"
                            component={Link}
                            to={`/rulesets/${ext.extensionId}`}
                            clickable
                            sx={{ fontWeight: 500, justifyContent: "flex-start" }}
                            onDelete={
                              isOwner
                                ? (e: MouseEvent) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleUnsubscribe(ruleset.id, ext.extensionId, ext.extensionName);
                                  }
                                : undefined
                            }
                          />
                        ))}
                      </Stack>
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

          {/* An archived ruleset's notice, and extensions that failed to load, above its tabs */}
          <Stack spacing={3}>
            {/* Read-Only Banner for Archived Rulesets */}
            {!!extensionsError && !subscribedExtensions && <LoadError what="Extensions" error={extensionsError} />}
            {ruleset.status === "Archived" && (
              <Alert severity="info">
                <Typography variant="body2">
                  <strong>This ruleset is archived and read-only.</strong> You can view all content but cannot make
                  changes.
                  {isOwner && " Unarchive it to edit it again."}
                </Typography>
              </Alert>
            )}

            <SectionTabs
              tabs={tabConfig}
              value={currentTab.key}
              onChange={(key) => navigate(`/rulesets/${id}/${key}`)}
              // Changing tab clears the URL's filters, so it opens with the ruleset's default "Local Changes".
              onTabHover={(key) => void prefetchSection(queryClient, id, key, isExtension)}
              aria-label="Ruleset Details Tabs"
            />
          </Stack>

          <Box role="tabpanel" sx={{ py: 3 }}>
            {/* Keyed by ruleset: a tab's list keeps its previous data while a search loads, never another ruleset's. */}
            <currentTab.component
              key={ruleset.id}
              ruleset={ruleset}
              childOnly={childOnly}
              onChildOnlyChange={setChildOnly}
            />
          </Box>
        </Stack>

        <Menu
          anchorEl={menu.anchorEl}
          open={menu.open}
          onClose={menu.closeMenu}
          slotProps={{ paper: { sx: { minWidth: 200 } } }}
        >
          {ruleset.status === "Published" && !isExtension && !isFork && (
            <ActionMenuItem
              icon={ForkIcon}
              label="Fork"
              description="Create your own editable copy"
              onClick={menu.closeMenuAnd(() => handleFork(ruleset))}
            />
          )}
          {!!ruleset.rulesetId && (
            <ActionMenuItem
              icon={CompareArrowsIcon}
              label="Local Changes"
              description="View added, modified, and deleted entities"
              onClick={menu.closeMenuAnd(() => setOverridesDialogOpen(true))}
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
                onClick={menu.closeMenuAnd(() => handleSubscribe(ruleset))}
              />
            )}
          {showContributorsMenu && (
            <ActionMenuItem
              icon={GroupIcon}
              label="Contributors"
              description="Admin, Editor, Viewer"
              onClick={menu.closeMenuAnd(() => setContributorsDialogOpen(true))}
            />
          )}
          {isOwner &&
            ruleset.rulesetId &&
            ruleset.status !== "Archived" && [
              <Divider key="sync-divider" />,
              <ActionMenuItem
                key="faq-link"
                icon={HelpIcon}
                label="Learn More in Help Center"
                href={EXTERNAL_LINKS.help}
                onClick={menu.closeMenu}
              />,
            ]}
          {canEditRuleset &&
            ruleset.status !== "Archived" && [
              <ActionMenuItem
                key="edit"
                icon={EditIcon}
                label="Edit"
                onClick={menu.closeMenuAnd(() => handleEdit(ruleset))}
              />,
              canPublish && ruleset.status === "Draft" && (
                <ActionMenuItem
                  key="publish"
                  icon={PublishIcon}
                  label="Publish"
                  intent="positive"
                  onClick={menu.closeMenuAnd(() => handlePublish(ruleset))}
                />
              ),
              <ActionMenuItem
                key="archive"
                icon={ArchiveIcon}
                label="Archive"
                intent="caution"
                onClick={menu.closeMenuAnd(() => handleArchive(ruleset))}
              />,
            ]}
          {isOwner && ruleset.status === "Archived" && (
            <ActionMenuItem
              icon={UnarchiveIcon}
              label="Unarchive"
              intent="positive"
              onClick={menu.closeMenuAnd(() => unarchiveMutation.mutate(ruleset.id))}
            />
          )}
        </Menu>

        <EditRulesetDialog
          open={editDialogOpen}
          onClose={() => setEditDialogOpen(false)}
          form={editForm}
          onSubmit={(data) => {
            if (selectedRuleset)
              updateMutation.mutate({ id: selectedRuleset.id, data, updatedAt: selectedRuleset.updatedAt });
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
            if (selectedRuleset) publishMutation.mutate({ id: selectedRuleset.id, kind });
          }}
          isLoading={publishMutation.isPending}
          canBeExtension={
            !!selectedRuleset?.rulesetId &&
            selectedRuleset.userId !== null &&
            selectedRuleset.extensionRulesetIds.length === 0
          }
          kind={publishKind}
          onKindChange={setPublishKind}
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
              baseRules={ruleset.baseRules}
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
          <DialogTitle>
            <Stack component="span" direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <GroupIcon /> Contributors
            </Stack>
          </DialogTitle>
          <DialogContent>
            <ContributorsSection ruleset={ruleset} onLeave={() => navigate("/rulesets")} />
          </DialogContent>
          <DialogFooter onCancel={() => setContributorsDialogOpen(false)} cancelLabel="Close" />
        </Modal>
      </Container>
    </PageTransition>
  );
}
