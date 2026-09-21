export const MAX_STORAGE_OBJECT_PATH_BYTES = 1024;

const CONTROL_CHARACTER = /\p{Cc}/u;
const ABSOLUTE_PATH = /^(?:[/\\]|[A-Za-z]:)/;
const STORAGE_IDENTIFIER = /^[A-Za-z0-9_-]+$/;

export class StoragePathError extends Error {
  constructor(message = "The storage path is invalid.") {
    super(message);
    this.name = "StoragePathError";
  }
}

function utf8Length(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function validateIdentifier(value: string) {
  if (!value || !STORAGE_IDENTIFIER.test(value) || CONTROL_CHARACTER.test(value)) {
    throw new StoragePathError();
  }
  return value;
}

export function normalizeStorageRelativePath(input: string) {
  if (!input || CONTROL_CHARACTER.test(input) || ABSOLUTE_PATH.test(input)) {
    throw new StoragePathError();
  }

  const normalized = input.normalize("NFC").replace(/\\/g, "/");
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new StoragePathError();
  }
  if (utf8Length(normalized) > MAX_STORAGE_OBJECT_PATH_BYTES) {
    throw new StoragePathError("The storage path is too long.");
  }
  return normalized;
}

export function deriveStorageObjectPath(userId: string, batchId: string, relativePath: string) {
  const path = `${validateIdentifier(userId)}/${validateIdentifier(batchId)}/${normalizeStorageRelativePath(relativePath)}`;
  if (utf8Length(path) > MAX_STORAGE_OBJECT_PATH_BYTES) {
    throw new StoragePathError("The storage path is too long.");
  }
  return path;
}
