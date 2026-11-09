-- A campaign's document's file is an attachment (`storage.attachments`, record type `CampaignDocument`), which the
-- blob sweep keeps while a row holds it: a document's delete, its folder's or its campaign's cascading to it, deletes its
-- attachment, as a user's and a character's delete does theirs, so the sweep reclaims its file.
--> statement-breakpoint
CREATE TRIGGER delete_attachments AFTER DELETE ON "campaign"."documents" REFERENCING OLD TABLE AS deleted_rows FOR EACH STATEMENT EXECUTE FUNCTION storage.delete_owned_attachments('CampaignDocument');
