import { Autocomplete, Box, Stack, TextField, Typography } from "@mui/material";

import {
  BlankState,
  DiceSpinner,
  ListToolbar,
  LoadError,
  Panel,
  ScrollSafeListbox,
  ValueChip,
} from "@/client/src/components/common/index.ts";
import { useRules, useRulesetPermissions } from "@/client/src/hooks/index.ts";
import { emptyOptionsText } from "@/client/src/lib/errorMessage.ts";
import type { EntityLinksDescription, RulesDescription } from "@/client/src/lib/queries.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import { truncate } from "@/client/src/lib/truncate.ts";
import { RemoveLinkDialog } from "@/client/src/pages/rulesets/details/owners/components/index.ts";
import { kindIconOf, ownerKindOf } from "@/client/src/pages/rulesets/details/owners/ownerKind.ts";
import type { OwnerSectionProps } from "@/client/src/pages/rulesets/details/owners/ownerTab.ts";

import { useOwnerLinks } from "./useOwnerLinks.ts";

/** The entities an owner links to (`links`), and the words its tab says them in, its rules' (`rules`). */
interface OwnerLinksProps extends OwnerSectionProps {
  links: EntityLinksDescription;
  rules: RulesDescription;
}

/**
 * The entities an owner links to, as chips, which an editor removes, and a picker of its kind's others, in its rules'
 * words.
 */
function OwnerLinks({ rulesetId, ownerId, ownerType, ruleset, restorable, links, rules }: OwnerLinksProps) {
  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);
  const one = entityTypeLabel(links.type, rules.words);
  const manyWord = entityTypeLabel(links.type, rules.words, true);
  const many = manyWord.toLowerCase();
  const ownerOne = entityTypeLabel(ownerType, rules.words);
  const owner = ownerOne.toLowerCase();
  const words = { one, owner };
  const icon = kindIconOf(rules, links.type);

  const {
    linked,
    error,
    options,
    isLoading,
    isOptionsLoading,
    optionsError,
    setSearch,
    handleOptionsScroll,
    removeDialog,
    addMutation,
    removeMutation,
    handleRemove,
    confirmRemove,
  } = useOwnerLinks(rulesetId, ownerType, ownerId, links, words);

  // The kind's entities the owner doesn't link to yet
  const unlinked = options.filter((option) => !linked?.some((link) => link.toId === option.id));

  return (
    <Stack spacing={3}>
      {canEdit && (
        <ListToolbar>
          <Box sx={{ minWidth: { xs: "100%", sm: 300 } }}>
            <Autocomplete
              options={unlinked}
              getOptionLabel={(option) => option.name}
              isOptionEqualToValue={(option, val) => option.id === val.id}
              filterOptions={(x) => x}
              renderOption={(props, option) => {
                const { key, ...otherProps } = props;
                return (
                  <Box component="li" key={key} {...otherProps}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {option.name}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        {truncate(option.description ?? "", 60)}
                      </Typography>
                    </Box>
                  </Box>
                );
              }}
              loading={isOptionsLoading}
              disabled={addMutation.isPending}
              onInputChange={(_, value, reason) => {
                if (reason === "input") setSearch(value);
              }}
              onChange={(_, option) => {
                if (option) {
                  addMutation.mutate(option.id);
                  setSearch("");
                }
              }}
              value={null}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={`Add ${one}`}
                  placeholder={`Search and select a ${one.toLowerCase()} to add…`}
                  size="small"
                />
              )}
              noOptionsText={emptyOptionsText(manyWord, optionsError, `No ${many} found`)}
              slotProps={{
                listbox: {
                  component: ScrollSafeListbox,
                  onScroll: handleOptionsScroll,
                },
              }}
            />
          </Box>
        </ListToolbar>
      )}
      {isLoading ? (
        <DiceSpinner sx={{ py: 4 }} />
      ) : error && !linked?.length ? (
        <LoadError what={`${ownerOne} ${many}`} error={error} />
      ) : !linked || linked.length === 0 ? (
        <BlankState
          icon={icon}
          title={`No ${owner} ${many} assigned`}
          description={
            canEdit
              ? `Use the search box above to find and add ${many} to this ${owner}.`
              : `This ${owner} doesn't have any ${many} assigned yet.`
          }
        />
      ) : (
        <Panel>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
            {linked.map((link) => (
              <ValueChip
                key={link.toId}
                label={link.toName}
                color="primary"
                onDelete={canEdit ? () => handleRemove(link.toId) : undefined}
              />
            ))}
          </Stack>
        </Panel>
      )}
      <RemoveLinkDialog
        open={removeDialog.open}
        onClose={removeDialog.close}
        onConfirm={confirmRemove}
        pending={removeMutation.isPending}
        restorable={restorable}
        words={words}
      />
    </Stack>
  );
}

/**
 * An owner's tab of the entities its kind links it to (`links`, its rules' owner kind's: 3.5's class skills), the
 * rules' owner kind's alone: a kind without links has no such tab.
 */
export function OwnerLinksSection({ ruleset, ...props }: OwnerSectionProps) {
  const { rules } = useRules(ruleset.baseRules);
  const links = ownerKindOf(rules)?.links;
  if (!rules || !links) return null;
  return <OwnerLinks {...props} ruleset={ruleset} links={links} rules={rules} />;
}
