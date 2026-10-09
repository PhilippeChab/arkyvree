import { Button, Container, Stack } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import {
  BlankState,
  CountChip,
  CREATED_SORTS,
  type FilterOption,
  ListCard,
  ListCardGrid,
  ListPageResults,
  NAME_SORTS,
  PageActionButton,
  PageHeader,
  PageTransition,
  SearchBar,
  type SortOption,
  UPDATED_SORTS,
  ValueChip,
} from "@/client/src/components/common/index.ts";
import { ArchiveIcon, CampaignIcon } from "@/client/src/components/icons/index.ts";
import { useIsDemo, useListPageQuery, useListParams, usePageTitle } from "@/client/src/hooks/index.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import {
  CAMPAIGN_LIST_DEFAULTS,
  campaignDetailQuery,
  type CampaignListFilters,
  campaignListQuery,
} from "@/client/src/lib/queries.ts";

import { CreateCampaignDialog } from "./components/index.ts";
import { prefetchCampaignSections } from "./details/sectionQueries.ts";
import { useCampaignOperations } from "./hooks/index.ts";

type CampaignView = CampaignListFilters["view"];
type SortField = CampaignListFilters["orderBy"];

const CAMPAIGN_FILTER_OPTIONS: FilterOption<CampaignView>[] = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

const CAMPAIGN_SORT_OPTIONS: SortOption<SortField>[] = [...NAME_SORTS, ...CREATED_SORTS, ...UPDATED_SORTS];

export default function CampaignsPage() {
  usePageTitle("Campaigns");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { searchParams, updateSearchParams, search, orderBy, orderDir, searchBarProps } = useListParams(
    ["name", "createdAt", "updatedAt"],
    CAMPAIGN_LIST_DEFAULTS,
  );
  const isDemo = useIsDemo();

  const view = oneOf(searchParams.get("view"), ["active", "archived"], CAMPAIGN_LIST_DEFAULTS.view);

  const { createDialog, createForm, createMutation, handleCreate, confirmCreate } = useCampaignOperations();

  const campaigns = useListPageQuery(campaignListQuery({ view, search, orderBy, orderDir }));

  // Warm the detail page and its tabs while the pointer is on a card.
  const prefetchCampaign = (id: string) => {
    void queryClient.prefetchQuery(campaignDetailQuery(id));
    void prefetchCampaignSections(queryClient, id);
  };

  const createButton = (label: string) => <PageActionButton label={label} onClick={handleCreate} />;

  return (
    <PageTransition>
      <Container maxWidth="xl">
        <Stack spacing={4}>
          <PageHeader
            variant="tinted"
            title="Campaigns"
            subtitle="Manage your campaigns and organize your adventuring parties"
            action={!isDemo && createButton("Create Campaign")}
          />

          <Stack spacing={3}>
            <SearchBar
              {...searchBarProps}
              searchPlaceholder="Search campaigns…"
              filterOptions={CAMPAIGN_FILTER_OPTIONS}
              filterValue={view}
              onFilterChange={(value) => updateSearchParams({ view: value })}
              sortOptions={CAMPAIGN_SORT_OPTIONS}
            />

            <ListPageResults
              list={campaigns}
              what="Campaigns"
              search={search}
              empty={
                view === "archived" ? (
                  <BlankState
                    icon={ArchiveIcon}
                    title="No archived campaigns"
                    description="Campaigns you archive will appear here. You can unarchive them at any time."
                    action={
                      <Button variant="outlined" onClick={() => updateSearchParams({ view: null })}>
                        View Active Campaigns
                      </Button>
                    }
                  />
                ) : (
                  <BlankState
                    icon={CampaignIcon}
                    title="No campaigns yet"
                    description={
                      isDemo
                        ? "Sign up to create campaigns and run multiplayer sessions."
                        : "Create your first campaign to start organizing your adventures"
                    }
                    action={!isDemo && createButton("Create Your First Campaign")}
                  />
                )
              }
            >
              <ListCardGrid>
                {campaigns.items.map((campaign, index) => (
                  <ListCard
                    key={campaign.id}
                    isArchived={view === "archived"}
                    animationIndex={index}
                    animationOffset={campaigns.offset}
                    onClick={() => navigate(`/campaigns/${campaign.id}`)}
                    onMouseEnter={() => prefetchCampaign(campaign.id)}
                    onFocus={() => prefetchCampaign(campaign.id)}
                    avatarTone="secondary"
                    title={campaign.name}
                    description={campaign.description}
                    chips={
                      <>
                        <CountChip label={formatCount(campaign.currentPlayers, "player")} />
                        <ValueChip label={campaign.rulesetName} />
                      </>
                    }
                  />
                ))}
              </ListCardGrid>
            </ListPageResults>
          </Stack>
        </Stack>

        {createDialog.target && (
          <CreateCampaignDialog
            open={createDialog.open}
            onClose={createDialog.close}
            onExited={createDialog.onExited}
            form={createForm}
            onSubmit={confirmCreate}
            isLoading={createMutation.isPending}
          />
        )}
      </Container>
    </PageTransition>
  );
}
