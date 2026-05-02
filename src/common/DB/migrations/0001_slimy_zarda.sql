CREATE TABLE "auth_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"client_id" text NOT NULL,
	"user_id" integer NOT NULL,
	"redirect_uri" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "redirect_uri" text NOT NULL;