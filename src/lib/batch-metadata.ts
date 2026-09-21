export type BatchInsertInput = {
  userId: string;
  displayName: string;
  fileCount: number;
  totalBytes: number;
};

export function buildBatchInsertValues({ userId, displayName, fileCount, totalBytes }: BatchInsertInput) {
  return { userId, displayName, fileCount, totalBytes, status: "queued" as const };
}
