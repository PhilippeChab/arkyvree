CREATE INDEX "activities_created_at_idx" ON "account"."activities" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "email_verifications_expires_at_idx" ON "account"."email_verifications" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "account"."notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "password_resets_expires_at_idx" ON "account"."password_resets" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "account"."sessions" USING btree ("expires_at");