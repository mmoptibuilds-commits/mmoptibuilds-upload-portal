import { bigint, boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["admin", "user"]);
export const uploadStatusEnum = pgEnum("upload_status", ["preparing", "queued", "uploading", "paused", "reconnecting", "retrying", "finalizing", "completed", "partial_failure", "failed", "cancelled"]);
export const notificationStatusEnum = pgEnum("notification_status", ["pending", "sent", "failed", "not_configured"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("user"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
}, (table) => [uniqueIndex("users_username_unique").on(table.username), index("users_enabled_idx").on(table.enabled)]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [index("sessions_user_idx").on(table.userId), index("sessions_expiry_idx").on(table.expiresAt)]);

export const uploadBatches = pgTable("upload_batches", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  displayName: text("display_name").notNull(),
  status: uploadStatusEnum("status").notNull().default("preparing"),
  fileCount: integer("file_count").notNull().default(0),
  totalBytes: bigint("total_bytes", { mode: "number" }).notNull().default(0),
  completedBytes: bigint("completed_bytes", { mode: "number" }).notNull().default(0),
  driveFolderId: text("drive_folder_id").notNull(),
  notificationStatus: notificationStatusEnum("notification_status").notNull().default("pending"),
  errorCategory: text("error_category"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [index("batches_user_created_idx").on(table.userId, table.createdAt), index("batches_status_idx").on(table.status)]);

export const uploadFiles = pgTable("upload_files", {
  id: uuid("id").defaultRandom().primaryKey(),
  batchId: uuid("batch_id").notNull().references(() => uploadBatches.id, { onDelete: "cascade" }),
  relativePath: text("relative_path").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  size: bigint("size", { mode: "number" }).notNull(),
  completedBytes: bigint("completed_bytes", { mode: "number" }).notNull().default(0),
  status: uploadStatusEnum("status").notNull().default("queued"),
  driveFileId: text("drive_file_id"),
  driveParentId: text("drive_parent_id").notNull(),
  resumableSessionUrl: text("resumable_session_url"),
  errorCategory: text("error_category"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [index("files_batch_idx").on(table.batchId), uniqueIndex("files_batch_path_unique").on(table.batchId, table.relativePath)]);

export const notificationEvents = pgTable("notification_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  batchId: uuid("batch_id").notNull().references(() => uploadBatches.id, { onDelete: "cascade" }),
  status: notificationStatusEnum("status").notNull(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("audit_created_idx").on(table.createdAt)]);
