import {
  Alert,
  Box,
  Button,
  Container,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Menu,
  Popover,
  Stack,
  Typography,
} from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type MouseEvent, useCallback, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";

import {
  ActionMenuItem,
  DetailPageHeader,
  DiceSpinner,
  HelpLabel,
  Modal,
  PageError,
  PageTransition,
  type SectionTab,
  SectionTabs,
  TagChip,
} from "@/client/src/components/common/index.ts";
import {
  AbilitiesIcon,
  AptitudesIcon,
  ArchiveIcon,
  ClassesIcon,
  CompareIcon,
  ContributorsIcon,
  EditIcon,
  ExtensionIcon,
  FeatsIcon,
  ForkIcon,
  HelpIcon,
  ItemsIcon,
  LanguagesIcon,
  MechanicsIcon,
  PublishIcon,
  RacesIcon,
  SavesIcon,
  SkillsIcon,
  SpellsIcon,
  StarredIcon,
  UnarchiveIcon,
  UnstarredIcon,
} from "@/client/src/components/icons/index.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { externalLinks } from "@/client/src/lib/externalLinks.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import { rulesetDetailQuery } from "@/client/src/lib/queries.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import { rulesetTags } from "@/client/src/pages/rulesets/components/index.ts";
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
        icon: SpellsIcon,
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
  if (id && !tabConfig.some((tab) => tab.key === section)) {
    return <Navigate to={`/rulesets/${id}/races`} replace />;
  }

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
        <PageError message={loadFailureMessage("Ruleset", error)} backLabel="Back to Rulesets" backTo={"/rulesets"} />
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
                {ruleset.isStarred ? <StarredIcon fontSize="medium" /> : <UnstarredIcon fontSize="medium" />}
              </IconButton>
            )
          }
          backTo={"/rulesets"}
          onMenuOpen={hasMenuItems ? (e) => setAnchorEl(e.currentTarget) : undefined}
          tags={[
            ...rulesetTags(ruleset, prefetchParent),
            ...(subscribedExtensions && subscribedExtensions.length > 0
              ? [
                  {
                    icon: ExtensionIcon,
                    label: formatCount(subscribedExtensions.length, "extension"),
                    color: subscribedExtensions.some((ext) => ext.updateAvailable)
                      ? ("warning" as const)
                      : ("default" as const),
                    onClick: (event: MouseEvent<HTMLElement>) => setExtensionsAnchor(event.currentTarget),
                  },
                ]
              : []),
          ]}
          description={ruleset.description || "Explore the complete rules and content for this game system"}
        >
          {ruleset.system && ruleset.baseRules === "Dungeons & Dragons: 3.5" && (
            <RulesetLicenseNotice key={ruleset.id} name={ruleset.name} />
          )}
        </DetailPageHeader>
        {subscribedExtensions && subscribedExtensions.length > 0 && (
          <Popover
            open={Boolean(extensionsAnchor)}
            anchorEl={extensionsAnchor}
            onClose={() => setExtensionsAnchor(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            transformOrigin={{ vertical: "top", horizontal: "center" }}
          >
            <Stack spacing={1} sx={{ p: 1.5, maxWidth: 360, alignItems: "flex-start" }}>
              {subscribedExtensions.map((ext) => (
                <TagChip
                  key={ext.extensionId}
                  size="medium"
                  tag={{
                    icon: ExtensionIcon,
                    label: ext.extensionName,
                    color: ext.updateAvailable ? "warning" : "default",
                    to: `/rulesets/${ext.extensionId}`,
                    onDelete: isOwner
                      ? () => handleUnsubscribe(ruleset.id, ext.extensionId, ext.extensionName)
                      : undefined,
                  }}
                />
              ))}
            </Stack>
          </Popover>
        )}

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
          // Changing tab clears the URL's filters, so it opens with the ruleset's default "Local Changes".
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
              icon={CompareIcon}
              label="Local Changes"
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
              <ActionMenuItem
                key="faq-link"
                icon={HelpIcon}
                label="Help Center"
                href={externalLinks.help}
                onClick={() => setAnchorEl(null)}
              />,
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
