export type Role = "admin" | "user";
export type UploadStatus = "preparing" | "queued" | "uploading" | "paused" | "reconnecting" | "retrying" | "finalizing" | "completed" | "partial_failure" | "failed" | "cancelled";
export type NotificationStatus = "pending" | "sent" | "failed" | "not_configured";

export type UploadItem = {
  id: string;
  file: File;
  relativePath: string;
  status: UploadStatus;
  uploadedBytes: number;
  speed: number;
  error?: string;
  sessionUrl?: string;
  dbFileId?: string;
  remoteFileId?: string;
  resetSession?: boolean;
};
