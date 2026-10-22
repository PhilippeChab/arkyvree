import { Container, Divider, Menu, Popover, Stack } from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type MouseEvent, type ReactNode, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";

import {
  ActionMenuItem,
  ArchivedNotice,
  CountChip,
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
  ArchiveIcon,
  CompareArrowsIcon,
  ContributorsIcon,
  EditIcon,
  ExtensionIcon,
  ForkIcon,
  HelpIcon,
  kindIcon,
  PublishIcon,
  SettingsIcon,
  UnarchiveIcon,
} from "@/client/src/components/icons/index.ts";
import {
  useAnchorMenu,
  usePageTitle,
  useRules,
  useRulesetPermissions,
  useSearchParam,
} from "@/client/src/hooks/index.ts";
import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { EXTERNAL_LINKS } from "@/client/src/lib/externalLinks.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import { type EntityKindDescription, type RulesDescription, rulesetDetailQuery } from "@/client/src/lib/queries.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import { RulesetFactChips, RulesetStarButton } from "@/client/src/pages/rulesets/components/index.ts";
import { useRulesetOperations } from "@/client/src/pages/rulesets/hooks/index.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

import {
  ArchiveRulesetDialog,
  EditRulesetDialog,
  ForkRulesetDialog,
  LicenseNotice,
  LocalChangesDialog,
  PublishRulesetDialog,
  RulesetContributorsDialog,
  SubscribeExtensionDialog,
  UnsubscribeExtensionDialog,
} from "./components/index.ts";
import { rulesetExtensionsQuery } from "./rulesetQueries.ts";
import type { RulesetSectionProps } from "./sectionProps.ts";
import { prefetchSection, type RulesetSection } from "./sectionQueries.ts";
import { EntitySection, FeatsSection, ItemsSection, PowersSection, SettingsSection } from "./sections/index.ts";

/**
 * What a ruleset page's tab is: its key, label and icon, and what it shows: its kind's section (`kind`), its own where
 * its kind has one (`component`), or its Settings.
 */
type TabConfig = SectionTab<RulesetSection> & {
  component?: (props: RulesetSectionProps) => ReactNode;
  kind: EntityKindDescription | null;
};

/** The entity types whose section is still their own, by their type: any other kind's is `EntitySection`. */
const SECTIONS: Readonly<Record<string, (props: RulesetSectionProps) => ReactNode>> = {
  feats: FeatsSection,
  items: ItemsSection,
  powers: PowersSection,
};

/**
 * The ruleset page's tabs: an entity kind's section each, in the order its rules list them (`rules`), named in their
 * words, with their picture and what their tab says of them, then its Settings.
 */
function rulesetTabs(rules: RulesDescription | undefined): TabConfig[] {
  const kinds: TabConfig[] = (rules?.kinds ?? []).map((kind) => {
    const label = entityTypeLabel(kind.type, rules?.words, true);
    return {
      key: getUrlSegment(kind.type),
      label: kind.help ? <HelpLabel label={label} help={kind.help} /> : label,
      icon: kindIcon(kind.icon),
      component: SECTIONS[kind.type],
      kind,
    };
  });
  return [
    ...kinds,
    {
      key: "settings",
      label: (
        <HelpLabel
          label="Settings"
          help="The ruleset's own rules, such as the ability a character's skill points come from. A fork starts from its source's and can change them."
        />
      ),
      icon: SettingsIcon,
      component: SettingsSection,
      kind: null,
    },
  ];
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
    confirmArchive,
    confirmEdit,
    confirmFork,
    confirmPublish,
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

  const [contributorsDialogOpen, setContributorsDialogOpen] = useState(false);
  const { rules, isPending: rulesPending } = useRules(ruleset?.baseRules);

  // Its tabs' names are its rules' words: it waits for them too, as they load once
  if (isLoading || rulesPending) {
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

  const tabConfig = rulesetTabs(rules);
  const currentTab = tabConfig.find((tab) => tab.key === section);

  // Normalize the URL to a known tab: its rules' first
  if (!currentTab) return <Navigate to={`/rulesets/${id}/${tabConfig[0]?.key ?? "settings"}`} replace />;

  const isActive = ruleset.status !== "Archived";
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
    ...(canEditRuleset
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
                    <CountChip
                      icon={<ExtensionIcon />}
                      label={formatCount(subscribedExtensions.length, "extension")}
                      color={subscribedExtensions.some((ext) => ext.updateAvailable) ? "warning" : "default"}
                      onClick={extensionsMenu.openMenu}
                      aria-expanded={extensionsMenu.open}
                    />
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
            {ruleset.system && rules?.license && (
              <LicenseNotice key={ruleset.id} license={rules.license} name={ruleset.name} />
            )}
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
              onTabHover={(key) =>
                void prefetchSection(
                  queryClient,
                  id,
                  key,
                  tabConfig.find((tab) => tab.key === key)?.kind ?? null,
                  isExtension,
                )
              }
              aria-label="Ruleset Details Tabs"
            />
          </Stack>

          <SectionTabPanel>
            {/* Keyed by ruleset and tab: a list keeps its previous data while a search loads, never another's. */}
            {currentTab.component ? (
              <currentTab.component
                key={`${ruleset.id}:${currentTab.key}`}
                ruleset={ruleset}
                childOnly={childOnly}
                onChildOnlyChange={setChildOnly}
              />
            ) : (
              currentTab.kind && (
                <EntitySection
                  key={`${ruleset.id}:${currentTab.key}`}
                  ruleset={ruleset}
                  childOnly={childOnly}
                  onChildOnlyChange={setChildOnly}
                  kind={currentTab.kind}
                />
              )
            )}
          </SectionTabPanel>
        </Stack>

        <Menu anchorEl={menu.anchorEl} open={menu.open} onClose={menu.closeMenu}>
          {menuItems}
        </Menu>

        <EditRulesetDialog
          open={editDialog.open}
          onClose={editDialog.close}
          form={editForm}
          onSubmit={confirmEdit}
          pending={updateMutation.isPending}
          isPublic={editDialog.target ? !editDialog.target.private : false}
          canBeExtension={canBeExtension}
        />

        <ArchiveRulesetDialog
          open={archiveDialog.open}
          onClose={archiveDialog.close}
          onConfirm={confirmArchive}
          pending={archiveMutation.isPending}
          canUnarchive={isOwner}
        />

        <PublishRulesetDialog
          open={publishDialog.open}
          onClose={publishDialog.close}
          onConfirm={confirmPublish}
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
