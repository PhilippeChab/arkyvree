ALTER TABLE "account"."subscriptions" DROP CONSTRAINT "subscriptions_plan_check";--> statement-breakpoint
ALTER TABLE "account"."subscriptions" ADD COLUMN "comp_reason" text;--> statement-breakpoint
ALTER TABLE "account"."subscriptions" ADD COLUMN "comped_at" timestamp;--> statement-breakpoint
ALTER TABLE "account"."subscriptions" ADD CONSTRAINT "subscriptions_plan_check" CHECK (plan = ANY (ARRAY['free'::text, 'pro'::text, 'comp'::text]));