ALTER TABLE "upload_batches" ALTER COLUMN "drive_folder_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "upload_files" ALTER COLUMN "drive_parent_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "upload_files" ADD COLUMN "storage_path" text;