export const APP_NAME = "mmoptibuilds Upload";
export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
export const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MiB, a multiple of Drive's 256 KiB requirement.
export const MAX_CONCURRENCY = 3;
export const SESSION_COOKIE = "mm_upload_session";
export const SHORT_SESSION_MS = 1000 * 60 * 60 * 12;
export const REMEMBER_SESSION_MS = 1000 * 60 * 60 * 24 * 30;
