export type Role = "admin" | "user";
export type UploadStatus = "preparing" | "queued" | "uploading" | "paused" | "reconnecting" | "retrying" | "finalizing" | "completed" | "partial_failure" | "failed" | "cancelled";
export type NotificationStatus = "pending" | "sent" | "failed" | "not_configured";

export type CompletionNotificationInput = {
  username: string;
  batchId: string;
  fileCount: number;
  totalBytes: number;
  completedAt: Date;
};

export type UploadItem = {
  id: string;
  file: File;
  relativePath: string;
  status: UploadStatus;
  uploadedBytes: number;
  speed: number;
  error?: string;
  dbFileId?: string;
  storagePath?: string;
  storageUploaded?: boolean;
};
