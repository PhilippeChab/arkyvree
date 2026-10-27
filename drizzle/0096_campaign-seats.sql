-- Archiving a campaign archives its row alone, and unarchiving it restores that row alone: a seat
-- (`campaign.players`) is archived only with its user's account, which keeps it archived. A campaign archived before
-- archiving left its seats alone archived them with it, in the same request, so an unarchived one came back with its
-- seats archived: its Game Master was refused its edits, and its characters' pages answered none. Each seat archived
-- within a second of its archived campaign is restored, as that archive would now leave it, unless its user's account
-- is deleted. No other column or row changes, nor a character's last change (`arkyvree.registry_sync`, which the touch
-- triggers read).

SELECT set_config('arkyvree.registry_sync', 'on', true);
-- The rows of the migrations before it run their deferred checks now: drizzle runs the pending migrations in one
-- transaction
SET CONSTRAINTS ALL IMMEDIATE;

-- The seats an archived campaign archived with it: live again, but a deleted account's
UPDATE campaign.players AS seat
SET deleted_at = NULL
FROM campaign.campaigns AS archived
WHERE seat.campaign_id = archived.id
  AND archived.deleted_at IS NOT NULL
  AND seat.deleted_at BETWEEN archived.deleted_at - interval '1 second' AND archived.deleted_at + interval '1 second'
  AND NOT EXISTS (
    SELECT 1 FROM account.users AS deleted WHERE deleted.id = seat.user_id AND deleted.deleted_at IS NOT NULL
  );

-- The deferred checks deferred again, for the migrations after this one in its transaction
SET CONSTRAINTS ALL DEFERRED;
