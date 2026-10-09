import { Button, Container, Divider, Menu, Popover, Stack } from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type MouseEvent, type ReactNode, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";

import {
  ActionMenuItem,
  ArchivedNotice,
  DetailPageHeader,
  HelpLabel,
  LoadError,
  PageError,
  PageLoader,
  PageTransition,
  type SectionTab,
  SectionTabPanel,
  SectionTabs,
  ValueChip,
} from "@/client/src/components/common/index.ts";
import {
  AbilitiesIcon,
  AptitudesIcon,
  ArchiveIcon,
  ClassesIcon,
  CompareArrowsIcon,
  ContributorsIcon,
  EditIcon,
  ExtensionIcon,
  FeatsIcon,
  ForkIcon,
  HelpIcon,
  ItemsIcon,
  LanguagesIcon,
  MechanicsIcon,
  PowersIcon,
  PublishIcon,
  RacesIcon,
  SavesIcon,
  SkillsIcon,
  UnarchiveIcon,
} from "@/client/src/components/icons/index.ts";
import { useAnchorMenu, usePageTitle, useRulesetPermissions, useSearchParam } from "@/client/src/hooks/index.ts";
import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { EXTERNAL_LINKS } from "@/client/src/lib/externalLinks.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import { rulesetDetailQuery } from "@/client/src/lib/queries.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import { RulesetFactChips, RulesetStarButton } from "@/client/src/pages/rulesets/components/index.ts";
import { useRulesetOperations } from "@/client/src/pages/rulesets/hooks/index.ts";
import { DEFAULT_BASE_RULES } from "@/shared/enums.ts";

import {
  ArchiveRulesetDialog,
  EditRulesetDialog,
  ForkRulesetDialog,
  LocalChangesDialog,
  PublishRulesetDialog,
  RulesetContributorsDialog,
  SubscribeExtensionDialog,
  UnsubscribeExtensionDialog,
} from "./components/index.ts";
import { rulesetExtensionsQuery } from "./rulesetQueries.ts";
import { getSections, type RulesetSectionProps } from "./sectionFactory.ts";
import { prefetchSection, type RulesetSection } from "./sectionQueries.ts";
import {
  AbilitiesSection,
  AptitudesSection,
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

  const { data: subscribedExtensions, error: extensionsError } = useQuery(
    rulesetExtensionsQuery(id, ruleset?.rulesetId),
  );

  const queryClient = useQueryClient();

  const {
    editDialog,
    forkDialog,
    archiveDialog,
    publishDialog,
    publishKind,
    setPublishKind,
    subscribeDialog,
    unsubscribeDialog,
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
  } = useRulesetOperations();

  const isExtension = !!ruleset && ruleset.kind === "extension";
  const [localChangesOpen, setLocalChangesOpen] = useState(false);
  const { value: childOnlyParam, setValue: setChildOnlyParam } = useSearchParam("childOnly");
  const childOnlyChoice = oneOf(childOnlyParam, ["true", "false"]);
  const childOnly = childOnlyChoice ? childOnlyChoice === "true" : isExtension;
  const setChildOnly = (value: boolean) => setChildOnlyParam(value ? "true" : "false");
  const menu = useAnchorMenu();
  const extensionsMenu = useAnchorMenu();
  if (!subscribedExtensions?.length && extensionsMenu.open) extensionsMenu.closeMenu();

  const { isOwner, isContributor, canEditEntities, canEditRuleset, canPublish } = useRulesetPermissions(ruleset);
  const isFork = !!ruleset?.rulesetId && !isExtension;

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
      <Container>
        <PageLoader />
      </Container>
    );
  }

  // A failed background refetch keeps the loaded page (and any edits in progress) on screen.
  if (!ruleset) {
    return (
      <Container>
        <PageError message={loadFailureMessage("Ruleset", error)} backLabel="Back to Rulesets" backTo={"/rulesets"} />
      </Container>
    );
  }

  const isActive = ruleset.status !== "Archived";
  const { LicenseNotice } = getSections(ruleset.baseRules);
  // A user's fork that subscribes to none can be an extension: what its edit and its publish offer
  const canBeExtension = !!ruleset.rulesetId && ruleset.userId !== null && ruleset.extensionRulesetIds.length === 0;
  // What the session may do here: the header's menu, whose button shows only when it holds something
  const menuItems = [
    ruleset.status === "Published" && !isExtension && !isFork && (
      <ActionMenuItem key="fork" icon={ForkIcon} label="Fork" onClick={menu.closeMenuAnd(() => handleFork(ruleset))} />
    ),
    !!ruleset.rulesetId && (
      <ActionMenuItem
        key="local-changes"
        icon={CompareArrowsIcon}
        label="Local Changes"
        onClick={menu.closeMenuAnd(() => setLocalChangesOpen(true))}
      />
    ),
    isOwner && !!ruleset.rulesetId && isActive && !ruleset.isUsedAsExtension && !isExtension && (
      <ActionMenuItem
        key="subscribe"
        icon={ExtensionIcon}
        label="Subscribe"
        onClick={menu.closeMenuAnd(() => handleSubscribe(ruleset))}
      />
    ),
    // An archived ruleset's too: its owner or an Admin removes a contributor, and a contributor leaves
    (isOwner || isContributor) && (
      <ActionMenuItem
        key="contributors"
        icon={ContributorsIcon}
        label="Contributors"
        onClick={menu.closeMenuAnd(() => setContributorsDialogOpen(true))}
      />
    ),
    ...(isOwner && !!ruleset.rulesetId && isActive
      ? [
          <Divider key="help-divider" />,
          <ActionMenuItem
            key="help"
            icon={HelpIcon}
            label="Help"
            href={EXTERNAL_LINKS.help}
            onClick={menu.closeMenu}
          />,
        ]
      : []),
    ...(canEditRuleset && isActive
      ? [
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
        ]
      : []),
    isOwner && !isActive && (
      <ActionMenuItem
        key="unarchive"
        icon={UnarchiveIcon}
        label="Unarchive"
        intent="positive"
        onClick={menu.closeMenuAnd(() => unarchiveMutation.mutate(ruleset.id))}
      />
    ),
  ].filter((item) => item !== false);

  return (
    <PageTransition>
      <Container>
        <Stack spacing={4}>
          <DetailPageHeader
            title={ruleset.name}
            titleAdornment={ruleset.isStarrable && <RulesetStarButton ruleset={ruleset} placement="title" />}
            backTo={"/rulesets"}
            onMenuOpen={menuItems.length > 0 ? menu.openMenu : undefined}
            chips={
              <>
                <RulesetFactChips ruleset={ruleset} />
                {subscribedExtensions && subscribedExtensions.length > 0 && (
                  <>
                    {/* Opens the list of its extensions; orange while one of them has an update */}
                    <Button
                      size="small"
                      variant="outlined"
                      color={subscribedExtensions.some((ext) => ext.updateAvailable) ? "warning" : "inherit"}
                      startIcon={<ExtensionIcon />}
                      onClick={extensionsMenu.openMenu}
                      aria-expanded={extensionsMenu.open}
                    >
                      Extensions ({subscribedExtensions.length})
                    </Button>
                    <Popover
                      open={extensionsMenu.open}
                      anchorEl={extensionsMenu.anchorEl}
                      onClose={extensionsMenu.closeMenu}
                      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
                      transformOrigin={{ vertical: "top", horizontal: "center" }}
                    >
                      {/* Each extension as long as its name, at the start of the list */}
                      <Stack spacing={1} sx={{ p: 1.5, maxWidth: 360, alignItems: "flex-start" }}>
                        {subscribedExtensions.map((ext) => (
                          <ValueChip
                            key={ext.extensionId}
                            icon={<ExtensionIcon />}
                            label={ext.extensionName}
                            color={ext.updateAvailable ? "warning" : "default"}
                            to={`/rulesets/${ext.extensionId}`}
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
            description={ruleset.description}
          >
            {ruleset.system && LicenseNotice && <LicenseNotice key={ruleset.id} name={ruleset.name} />}
          </DetailPageHeader>

          {/* An archived ruleset's notice, and extensions that failed to load, above its tabs */}
          <Stack spacing={3}>
            {!!extensionsError && !subscribedExtensions && <LoadError what="Extensions" error={extensionsError} />}
            {!isActive && <ArchivedNotice what="ruleset" canUnarchive={isOwner} />}

            <SectionTabs
              tabs={tabConfig}
              value={currentTab.key}
              onChange={(key) => navigate(`/rulesets/${id}/${key}`)}
              // Changing tab clears the URL's filters, so it opens with the ruleset's default "Local Changes".
              onTabHover={(key) => void prefetchSection(queryClient, id, key, isExtension)}
              aria-label="Ruleset Details Tabs"
            />
          </Stack>

          <SectionTabPanel>
            {/* Keyed by ruleset: a tab's list keeps its previous data while a search loads, never another ruleset's. */}
            <currentTab.component
              key={ruleset.id}
              ruleset={ruleset}
              childOnly={childOnly}
              onChildOnlyChange={setChildOnly}
            />
          </SectionTabPanel>
        </Stack>

        <Menu anchorEl={menu.anchorEl} open={menu.open} onClose={menu.closeMenu}>
          {menuItems}
        </Menu>

        <EditRulesetDialog
          open={editDialog.open}
          onClose={editDialog.close}
          form={editForm}
          onSubmit={(data) => {
            const edited = editDialog.target;
            if (edited) updateMutation.mutate({ id: edited.id, data, updatedAt: edited.updatedAt });
          }}
          pending={updateMutation.isPending}
          isPublic={editDialog.target ? !editDialog.target.private : false}
          canBeExtension={canBeExtension}
        />

        <ArchiveRulesetDialog
          open={archiveDialog.open}
          onClose={archiveDialog.close}
          onConfirm={() => {
            if (archiveDialog.target) {
              archiveMutation.mutate(archiveDialog.target.id, {
                onSuccess: () => navigate("/rulesets"),
              });
            }
          }}
          pending={archiveMutation.isPending}
          canUnarchive={isOwner}
        />

        <PublishRulesetDialog
          open={publishDialog.open}
          onClose={publishDialog.close}
          onConfirm={(kind) => {
            if (publishDialog.target) publishMutation.mutate({ id: publishDialog.target.id, kind });
          }}
          pending={publishMutation.isPending}
          canBeExtension={canBeExtension}
          kind={publishKind}
          onKindChange={setPublishKind}
        />

        <ForkRulesetDialog
          open={forkDialog.open}
          onClose={forkDialog.close}
          form={forkForm}
          onSubmit={confirmFork}
          pending={forkMutation.isPending}
        />

        {ruleset.rulesetId && (
          <>
            <LocalChangesDialog
              open={localChangesOpen}
              onClose={() => setLocalChangesOpen(false)}
              rulesetId={ruleset.id}
              baseRules={ruleset.baseRules}
              canEdit={canEditEntities}
            />

            <SubscribeExtensionDialog
              open={subscribeDialog.open}
              onClose={subscribeDialog.close}
              onConfirm={confirmSubscribe}
              pending={subscribeMutation.isPending}
              subscribedExtensionIds={subscribedExtensions?.map((ext) => ext.extensionId) ?? []}
            />

            <UnsubscribeExtensionDialog
              open={unsubscribeDialog.open}
              onClose={unsubscribeDialog.close}
              onConfirm={confirmUnsubscribe}
              pending={unsubscribeMutation.isPending}
              extensionName={unsubscribeDialog.target?.extensionName ?? ""}
            />
          </>
        )}

        <RulesetContributorsDialog
          ruleset={ruleset}
          open={contributorsDialogOpen}
          onClose={() => setContributorsDialogOpen(false)}
        />
      </Container>
    </PageTransition>
  );
}
