ALTER TABLE "scores" ADD COLUMN "share_token_hash" text;--> statement-breakpoint
ALTER TABLE "scores" ADD COLUMN "practice_sections" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "scores" ADD COLUMN "practice_rev" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_share_token_hash_uq" UNIQUE("share_token_hash");