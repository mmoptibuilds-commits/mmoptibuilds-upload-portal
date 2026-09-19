import { GoogleAuth, JWT } from "google-auth-library";
import { DRIVE_FOLDER_MIME } from "@/lib/constants";
import { getEnv } from "@/lib/env";
import { safeRelativePath } from "@/lib/security";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

type DriveFile = { id: string; name?: string; parents?: string[]; webViewLink?: string; size?: string; mimeType?: string };

const folderCreationLocks = new Map<string, Promise<string>>();

async function token() {
  const env = getEnv();
  const client = env.GOOGLE_IMPERSONATE_EMAIL
    ? new JWT({ email: env.GOOGLE_CLIENT_EMAIL, key: env.GOOGLE_PRIVATE_KEY, scopes: [DRIVE_SCOPE], subject: env.GOOGLE_IMPERSONATE_EMAIL })
    : await new GoogleAuth({ credentials: { project_id: env.GOOGLE_PROJECT_ID, client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY }, scopes: [DRIVE_SCOPE] }).getClient();
  const value = await client.getAccessToken();
  if (!value.token) throw new Error("Google access token could not be created.");
  return value.token;
}

async function driveFetch(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${await token()}`, ...init.headers } });
  if (!response.ok) throw new DriveError(response.status, await response.text());
  return response;
}

function filesQuery(fields: string, upload = false) {
  const env = getEnv();
  const params = new URLSearchParams({ fields, supportsAllDrives: "true" });
  if (!upload) {
    params.set("includeItemsFromAllDrives", "true");
    if (env.GOOGLE_DRIVE_SHARED_DRIVE_ID) { params.set("corpora", "drive"); params.set("driveId", env.GOOGLE_DRIVE_SHARED_DRIVE_ID); }
  }
  return params.toString();
}

function quoteQueryValue(value: string) { return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }

export async function createFolder(name: string, parentId: string, appProperties?: Record<string, string>) {
  const response = await driveFetch(`${DRIVE_API}/files?${filesQuery("id,name")}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: DRIVE_FOLDER_MIME, parents: [parentId], appProperties }) });
  return response.json() as Promise<DriveFile>;
}

export async function createEmptyFile(name: string, parentId: string, mimeType: string) {
  const response = await driveFetch(`${DRIVE_API}/files?${filesQuery("id,name,parents,size,mimeType")}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, parents: [parentId], mimeType: mimeType || "application/octet-stream" }) });
  return response.json() as Promise<DriveFile>;
}

export async function ensureFolderPath(parentId: string, parts: string[], cache = new Map<string, string>()) {
  let current = parentId;
  for (const name of parts) {
    const key = `${current}/${name}`;
    const cached = cache.get(key);
    if (cached) { current = cached; continue; }
    const inFlight = folderCreationLocks.get(key);
    if (inFlight) {
      current = await inFlight;
      cache.set(key, current);
      continue;
    }
    const creation = (async () => {
      const query = encodeURIComponent(`name = '${quoteQueryValue(name)}' and '${quoteQueryValue(current)}' in parents and mimeType = '${DRIVE_FOLDER_MIME}' and trashed = false`);
      const found = await driveFetch(`${DRIVE_API}/files?q=${query}&pageSize=1&${filesQuery("files(id,name)")}`);
      const json = await found.json() as { files: DriveFile[] };
      const folder = json.files[0] ?? await createFolder(name, current, { mmoptibuildsFolderKey: `${current}/${name}` });
      return folder.id;
    })();
    folderCreationLocks.set(key, creation);
    try {
      current = await creation;
      cache.set(key, current);
    } finally {
      if (folderCreationLocks.get(key) === creation) folderCreationLocks.delete(key);
    }
  }
  return current;
}

export async function createBatchFolder(username: string, batchId: string) {
  const env = getEnv();
  const root = await ensureFolderPath(env.GOOGLE_DRIVE_ROOT_FOLDER_ID, [username]);
  return createFolder(`${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}_${batchId.slice(0, 6).toUpperCase()}`, root, { mmoptibuildsBatchId: batchId });
}

export async function initResumableUpload(input: { name: string; relativePath: string; size: number; mimeType: string; batchFolderId: string; folderCache: Map<string, string> }) {
  const path = safeRelativePath(input.relativePath).split("/");
  const name = path.pop()!;
  const parent = await ensureFolderPath(input.batchFolderId, path, input.folderCache);
  if (input.size === 0) {
    const file = await createEmptyFile(name, parent, input.mimeType);
    return { sessionUrl: null, parent, driveFileId: file.id };
  }
  const response = await driveFetch(`${DRIVE_UPLOAD}?uploadType=resumable&${filesQuery("id,name,parents", true)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": input.mimeType || "application/octet-stream", "X-Upload-Content-Length": String(input.size) },
    body: JSON.stringify({ name, parents: [parent], appProperties: { mmoptibuildsFilePath: `${input.batchFolderId}/${input.relativePath}` } }),
  });
  const sessionUrl = response.headers.get("location");
  if (!sessionUrl) throw new Error("Drive did not return a resumable upload session.");
  return { sessionUrl, parent, driveFileId: null };
}

export async function inspectDriveFile(id: string) {
  const response = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(id)}?${filesQuery("id,name,parents,webViewLink,size,mimeType")}`);
  return response.json() as Promise<DriveFile>;
}

export class DriveError extends Error { constructor(public status: number, public detail: string) { super(`Drive request failed (${status}).`); } }
