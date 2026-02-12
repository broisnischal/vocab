CREATE TABLE "vocab" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"word" text NOT NULL,
	"pos" text,
	"level" text,
	"definition" text,
	"examples" jsonb DEFAULT '[]'::jsonb,
	"synonyms" jsonb DEFAULT '[]'::jsonb,
	"embedding" vector(384),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "vocab_word_idx" ON "vocab" USING btree ("word");