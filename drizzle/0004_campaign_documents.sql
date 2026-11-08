-- A campaign's documents: a tree of folders and documents its Game Masters keep, each Private (the Game Masters'),
-- Public (every player's) or Selected (the seats `document_readers` names). A folder's parent is a folder of its own
-- campaign, which deletes what it holds with it; a seat's reader rows go with the seat.
--> statement-breakpoint
CREATE TABLE "campaign"."document_readers" (
	"document_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	CONSTRAINT "document_readers_pkey" PRIMARY KEY("document_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "campaign"."documents" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"parent_id" uuid,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"body" text,
	"visibility" text DEFAULT 'Private' NOT NULL,
	"author_id" uuid,
	CONSTRAINT "documents_campaign_id_id_key" UNIQUE("campaign_id","id"),
	CONSTRAINT "documents_kind_check" CHECK (kind = ANY (ARRAY['Folder'::text, 'Document'::text])),
	CONSTRAINT "documents_visibility_check" CHECK (visibility = ANY (ARRAY['Private'::text, 'Public'::text, 'Selected'::text])),
	CONSTRAINT "documents_folder_body_check" CHECK ((kind = 'Document'::text) OR (body IS NULL))
);
--> statement-breakpoint
ALTER TABLE "campaign"."document_readers" ADD CONSTRAINT "document_readers_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "campaign"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign"."document_readers" ADD CONSTRAINT "document_readers_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "campaign"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign"."documents" ADD CONSTRAINT "documents_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign"."documents" ADD CONSTRAINT "documents_parent_id_fkey" FOREIGN KEY ("campaign_id","parent_id") REFERENCES "campaign"."documents"("campaign_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign"."documents" ADD CONSTRAINT "documents_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "account"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_readers_player_id_idx" ON "campaign"."document_readers" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "documents_campaign_id_parent_id_idx" ON "campaign"."documents" USING btree ("campaign_id","parent_id");--> statement-breakpoint
CREATE INDEX "documents_author_id_idx" ON "campaign"."documents" USING btree ("author_id");